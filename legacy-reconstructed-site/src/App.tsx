import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { Header } from './components/Header';
import { HomePage } from './pages/HomePage';
import { ProjectsPage } from './pages/ProjectsPage';
import { DeepDivesPage } from './pages/DeepDivesPage';
import { EpisodePage } from './pages/EpisodePage';
import { StudioPage } from './pages/StudioPageV2';
import { ChatPage } from './pages/ChatPage';
import './styles.css';
import './repair.css';

export default function App() {
  return <BrowserRouter><AuthProvider><div className="app-shell"><Header/><main>
    <Routes>
      <Route path="/" element={<HomePage/>}/>
      <Route path="/projects" element={<ProjectsPage/>}/>
      <Route path="/deep-dives" element={<DeepDivesPage/>}/>
      <Route path="/deep-dives/:episodeId" element={<EpisodePage/>}/>
      <Route path="/studio" element={<StudioPage/>}/>
      <Route path="/chat" element={<ChatPage/>}/>
    </Routes>
  </main><footer>© 2026 DeepCast Studio. All rights reserved.</footer></div></AuthProvider></BrowserRouter>;
}
