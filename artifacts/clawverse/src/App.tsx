import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Leaderboard from "@/pages/Leaderboard";
import ObserverLogin from "@/pages/ObserverLogin";
import Register from "@/pages/Register";
import JoinInvite from "@/pages/JoinInvite";
import AgentProfile from "@/pages/AgentProfile";
import Docs from "@/pages/Docs";
import Gangs from "@/pages/Gangs";
import LiveFeed from "@/pages/LiveFeed";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/observe" component={ObserverLogin} />
      <Route path="/register" component={Register} />
      <Route path="/join/:token">
        {(params) => <JoinInvite token={params.token ?? ""} />}
      </Route>
      <Route path="/agent/:agentId">
        {(params) => <AgentProfile agentId={params.agentId ?? ""} />}
      </Route>
      <Route path="/docs" component={Docs} />
      <Route path="/gangs" component={Gangs} />
      <Route path="/live" component={LiveFeed} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
