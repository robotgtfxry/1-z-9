import { useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import Operator from './routes/Operator.jsx'
import Rejestracja from './routes/Rejestracja.jsx'
import Prezentacja from './routes/Prezentacja.jsx'
import Wyniki from './routes/Wyniki.jsx'
import Pytania from './routes/Pytania.jsx'
import Protected from './components/Protected.jsx'
import SoundPlayer from './components/SoundPlayer.jsx'
import { auth } from './api'

export default function App() {
  const [tick, setTick] = useState(0)
  const isLogged = auth.has()
  const logout = () => { auth.clear(); setTick(t => t + 1) }

  return (
    <div className="app">
      <SoundPlayer />
      <nav className="nav">
        <NavLink to="/"             end>Operator</NavLink>
        <NavLink to="/rejestracja"    >Rejestracja</NavLink>
        <NavLink to="/pytania"        >Pytania</NavLink>
        <NavLink to="/prezentacja"    >Prezentacja</NavLink>
        <NavLink to="/wyniki"         >Wyniki</NavLink>
        {isLogged && (
          <button className="nav-logout" onClick={logout} title="Wyloguj">wyloguj</button>
        )}
      </nav>
      <Routes>
        <Route path="/"            element={<Protected><Operator    key={tick} /></Protected>} />
        <Route path="/rejestracja" element={<Protected><Rejestracja key={tick} /></Protected>} />
        <Route path="/pytania"     element={<Protected><Pytania     key={tick} /></Protected>} />
        <Route path="/prezentacja" element={<Prezentacja />} />
        <Route path="/wyniki"      element={<Wyniki />} />
      </Routes>
    </div>
  )
}
