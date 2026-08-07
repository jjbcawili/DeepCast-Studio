import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { HomePage } from './pages/HomePage';
import { ProjectsPage } from './pages/ProjectsPage';
import { DeepDivesPage } from './pages/DeepDivesPage';
import { StudioPage } from './pages/StudioPage';
import { ChatPage } from './pages/ChatPage';
import './styles.css';

export default function App() {
  return <BrowserRouter><div className="app-shell"><Header/><main>
    <Routes>
      <Route path="/" element={<HomePage/>}/>
      <Route path="/projects" element={<ProjectsPage/>}/>
      <Route path="/deep-dives" element={<DeepDivesPage/>}/>
      <Route path="/studio" element={<StudioPage/>}/>
      <Route path="/chat" element={<ChatPage/>}/>
    </Routes>
  </main><footer>© 2026 DeepCast Studio. All rights reserved.</footer></div></BrowserRouter>;
}
