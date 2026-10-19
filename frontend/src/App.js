import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "sonner";
import Header from "./components/Header";
import Footer from "./components/Footer";
import WalletContext from "./solana/WalletContext";
import { AuthProvider } from "./solana/AuthContext";
import Home from "./pages/Home";
import New from "./pages/New";
import Strategies from "./pages/Strategies";
import StrategyDetail from "./pages/StrategyDetail";
import Traders from "./pages/Traders";
import Leaderboard from "./pages/Leaderboard";
import Revenue from "./pages/Revenue";
import Account from "./pages/Account";
import Markets from "./pages/Markets";
import Legal from "./pages/Legal";

function App() {
  return (
    <div className="App min-h-screen bg-[#070708] text-[#f4f4f5]">
      <WalletContext>
        <AuthProvider>
          <HelmetProvider>
          <BrowserRouter>
            <Header />
            <main>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/new" element={<New />} />
                <Route path="/strategies" element={<Strategies />} />
                <Route path="/strategies/:id" element={<StrategyDetail />} />
                <Route path="/traders" element={<Traders />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                <Route path="/revenue" element={<Revenue />} />
                <Route path="/markets" element={<Markets />} />
                <Route path="/terms" element={<Legal page="terms" />} />
                <Route path="/privacy" element={<Legal page="privacy" />} />
                <Route path="/risk" element={<Legal page="risk" />} />
                <Route path="/account" element={<Account />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
            <Footer />
          </BrowserRouter>
          </HelmetProvider>
        </AuthProvider>
      </WalletContext>
      <Toaster position="bottom-right" toastOptions={{
        style: { background: "#ffffff", border: "1px solid #f4f4f514", color: "#f4f4f5", fontFamily: "Instrument Sans, sans-serif" },
      }} />
    </div>
  );
}

export default App;
