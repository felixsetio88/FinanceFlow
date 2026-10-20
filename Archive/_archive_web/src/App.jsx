import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Charts from './pages/Charts';
import Budget from './pages/Budget';
import Assets from './pages/Assets';
import AddTransaction from './pages/AddTransaction';
import './App.css';

function AppContent() {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <Layout onAddClick={() => setShowAdd(true)}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/charts" element={<Charts />} />
        <Route path="/budget" element={<Budget />} />
        <Route path="/assets" element={<Assets />} />
      </Routes>
      <AddTransaction isOpen={showAdd} onClose={() => setShowAdd(false)} />
    </Layout>
  );
}

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;
