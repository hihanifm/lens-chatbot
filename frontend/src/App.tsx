import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Session from "./pages/Session";
import Header from "./components/Header";
import { TransferBanner } from "./components/Transfer/Banner";
import { WikiBanner } from "./components/Wiki/Banner";
import { useThemeBootstrap } from "./state/theme";
import { useAuth } from "./state/auth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, refetchOnWindowFocus: false },
  },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const userId = useAuth((s) => s.userId);
  if (!userId) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Shell() {
  useThemeBootstrap();
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header />
      <TransferBanner />
      <WikiBanner />
      <main className="flex-1 flex flex-col min-h-0">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Home />
              </RequireAuth>
            }
          />
          <Route
            path="/session/:id"
            element={
              <RequireAuth>
                <Session />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
