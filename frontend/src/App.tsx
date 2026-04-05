import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import HomePage from './pages/HomePage'
import ExplorePage from './pages/ExplorePage'
import BuildingPage from './pages/BuildingPage'
import ReconstructPage from './pages/ReconstructPage'
import MyModelsPage from './pages/MyModelsPage'
import ContributePage from './pages/ContributePage'
import AboutPage from './pages/AboutPage'

export default function App() {
  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/building/:id" element={<BuildingPage />} />
        <Route path="/reconstruct" element={<ReconstructPage />} />
        <Route path="/my" element={<MyModelsPage />} />
        <Route path="/contribute/:id" element={<ContributePage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </div>
  )
}
