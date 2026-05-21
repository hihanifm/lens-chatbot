import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { useAuthLogin } from "../api/queries";
import { useAuth } from "../state/auth";

export default function Login() {
  const navigate = useNavigate();
  const setUser = useAuth((s) => s.setUser);
  const login = useAuthLogin();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const user = await login.mutateAsync({ name: name.trim(), pin });
      setUser(user.id, user.name);
      navigate("/", { replace: true });
    } catch {
      /* error rendered below via login.error */
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="w-[92%] max-w-sm mx-auto py-16">
      <Card className="px-8 py-9 border-t-4 border-t-blue-600">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
          Sign in or register
        </h1>
        <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">
          New name → auto-registered. Returning? Same name + PIN logs you in.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="name-input" className="block text-sm font-medium mb-1 text-gray-600 dark:text-slate-300">
              Name
            </label>
            <Input
              id="name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alice"
              maxLength={50}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label htmlFor="pin-input" className="block text-sm font-medium mb-1 text-gray-600 dark:text-slate-300">
              PIN
            </label>
            <Input
              id="pin-input"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="4–6 digits"
              maxLength={6}
              autoComplete="current-password"
              required
            />
          </div>

          {login.isError && (
            <p className="text-sm rounded-lg px-3 py-2 bg-red-50 text-red-600 border border-red-200
              dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">
              {login.error.message}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={login.isPending || !name.trim() || !pin}
          >
            {login.isPending ? "Signing in…" : "Enter LENS"}
          </Button>
        </form>
      </Card>
      </div>
    </div>
  );
}
