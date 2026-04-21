import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { UserProvider } from './hooks/useUser';
import { BottomNav } from './components/BottomNav';
import { HomePage } from './pages/HomePage';
import { ServicesPage } from './pages/ServicesPage';
import { MastersPage } from './pages/MastersPage';
import { BookingPage } from './pages/BookingPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';

export function App() {
  return (
    <BrowserRouter>
      <UserProvider>
        <div className="app-shell">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/services" element={<ServicesPage />} />
            <Route path="/masters" element={<MastersPage />} />
            <Route path="/book" element={<BookingPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
          <BottomNav />
        </div>
      </UserProvider>
    </BrowserRouter>
  );
}
