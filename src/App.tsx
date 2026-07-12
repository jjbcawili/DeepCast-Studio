import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import StudioPage from './StudioPage';
import HomePage from './HomePage';
import SourcesPage from './SourcesPage';
import ChatPage from './ChatPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/studio" element={<StudioPage />} />
        <Route path="/sources" element={<SourcesPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
