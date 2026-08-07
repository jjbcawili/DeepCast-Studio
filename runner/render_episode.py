import os
import pathlib
import subprocess
import tempfile

import boto3
import numpy as np
import requests
import soundfile as sf
from kokoro import KPipeline

EPISODE_ID = os.environ['EPISODE_ID']
API = os.environ['DEEPCAST_BACKGROUND_API'].rstrip('/')
CALLBACK_SECRET = os.environ['DEEPCAST_RUNNER_CALLBACK_SECRET']
BUCKET = os.environ['R2_BUCKET']
JIRO_VOICE = os.getenv('KOKORO_JIRO_VOICE') or 'am_michael'
SHARPAY_VOICE = os.getenv('KOKORO_SHARPAY_VOICE') or 'af_heart'
HEADERS = {'Authorization': f'Bearer {CALLBACK_SECRET}', 'Content-Type': 'application/json'}

def r2():
    return boto3.client('s3', endpoint_url=os.environ['R2_ENDPOINT_URL'], aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'], aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'], region_name='auto')

def callback(**payload):
    response=requests.post(f'{API}/api/runner/callback',headers=HEADERS,json={'episodeId':EPISODE_ID,**payload},timeout=30);response.raise_for_status()

def manifest():
    response=requests.get(f'{API}/api/runner/episodes/{EPISODE_ID}/manifest',headers={'Authorization':f'Bearer {CALLBACK_SECRET}'},timeout=30);response.raise_for_status();return response.json()

def synthesize(pipeline,text,voice,path):
    chunks=[]
    for _,_,audio in pipeline(text,voice=voice): chunks.append(audio)
    if not chunks: raise RuntimeError('KOKORO_EMPTY_AUDIO')
    sf.write(path,np.concatenate(chunks),24000)

def ffmpeg(args):
    process=subprocess.run(['ffmpeg','-y',*args],stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False)
    if process.returncode: raise RuntimeError(process.stderr.decode('utf-8','ignore')[-1800:])

def main():
    data=manifest();segments=data.get('segments') or []
    if not segments: raise RuntimeError('NO_SCRIPT_SEGMENTS')
    pipeline=KPipeline(lang_code='a');client=r2();callback(status='working',stage='kokoro_tts',progress=54)
    with tempfile.TemporaryDirectory() as td:
        root=pathlib.Path(td);mixed_files=[];callback_segments=[];total=len(segments)
        for position,segment in enumerate(segments):
            if segment.get('status')=='ready' and segment.get('audio_r2_key'):
                local_mp3=root/f'{position:04d}.mp3';client.download_file(BUCKET,segment['audio_r2_key'],str(local_mp3));mixed_files.append(local_mp3);callback_segments.append({'id':segment['id'],'status':'ready','attempts':int(segment.get('attempts') or 1),'audioR2Key':segment['audio_r2_key']});continue
            wav=root/f'{position:04d}.wav';mp3=root/f'{position:04d}.mp3';voice=JIRO_VOICE if segment['speaker']=='Jiro' else SHARPAY_VOICE
            try:
                synthesize(pipeline,segment['text'],voice,wav);pan='pan=stereo|c0=1.0*c0|c1=0.72*c0' if segment['speaker']=='Jiro' else 'pan=stereo|c0=0.72*c0|c1=1.0*c0';ffmpeg(['-i',str(wav),'-af',f'{pan},loudnorm=I=-18:TP=-2:LRA=11','-ar','44100','-ac','2','-c:a','libmp3lame','-b:a','160k',str(mp3)]);key=f'episodes/{EPISODE_ID}/segments/{position:04d}-{segment["speaker"].lower()}-{segment["id"]}.mp3';client.upload_file(str(mp3),BUCKET,key,ExtraArgs={'ContentType':'audio/mpeg'});mixed_files.append(mp3);callback_segments.append({'id':segment['id'],'status':'ready','attempts':int(segment.get('attempts') or 0)+1,'audioR2Key':key})
            except Exception as exc:
                callback_segments.append({'id':segment['id'],'status':'failed','attempts':int(segment.get('attempts') or 0)+1,'failureMessage':str(exc)});callback(status='failed',stage='kokoro_tts',code='TTS_SEGMENT_FAILED',message=f'Segment {position+1} failed: {exc}',segments=callback_segments);raise
            progress=54+int(((position+1)/total)*31)
            if position%3==0 or position+1==total: callback(status='working',stage='kokoro_tts',progress=progress,segments=callback_segments)
        callback(status='working',stage='ffmpeg_mix',progress=88,segments=callback_segments);concat=root/'concat.txt';concat.write_text(''.join(f"file '{path.as_posix()}'\n" for path in mixed_files),encoding='utf-8');joined=root/'complete.mp3';ffmpeg(['-f','concat','-safe','0','-i',str(concat),'-c','copy',str(joined)]);wav=root/'complete.wav';m4a=root/'complete.m4a';ffmpeg(['-i',str(joined),'-c:a','pcm_s16le',str(wav)]);ffmpeg(['-i',str(joined),'-c:a','aac','-b:a','192k',str(m4a)]);exports={}
        for fmt,file_path,mime in [('mp3',joined,'audio/mpeg'),('wav',wav,'audio/wav'),('m4a',m4a,'audio/mp4')]:
            key=f'episodes/{EPISODE_ID}/exports/complete.{fmt}';client.upload_file(str(file_path),BUCKET,key,ExtraArgs={'ContentType':mime});exports[fmt]=key
        callback(status='ready',stage='complete',progress=100,segments=callback_segments,exports=exports)

if __name__=='__main__':
    try: main()
    except Exception as exc:
        try: callback(status='failed',stage='github_actions_runner',code='RUNNER_FAILED',message=str(exc))
        finally: raise
