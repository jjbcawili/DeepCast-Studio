import React from 'react';
import { Link } from 'react-router-dom';

export default function ChatPage() {
  return (
    <div className="min-h-screen bg-[#080808] text-zinc-100 font-sans flex flex-col items-center justify-center">
      <h1 className="text-4xl font-black uppercase tracking-tighter mb-4">Chat</h1>
      <Link to="/" className="text-indigo-400 hover:text-indigo-300 font-bold tracking-widest uppercase text-sm">
        Return Home
      </Link>
    </div>
  );
}
