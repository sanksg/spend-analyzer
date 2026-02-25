import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    Upload,
    Receipt,
    Tags,
    FileText,
    Wallet,
    Lightbulb,
    Sparkles,
    CalendarDays,
    Settings as SettingsIcon,
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import UploadPage from './pages/Upload';
import Transactions from './pages/Transactions';
import Categories from './pages/Categories';
import Statements from './pages/Statements';
import StatementDetail from './pages/StatementDetail';
import Insights from './pages/Insights';
import Analysis from './pages/Analysis';
import Settings from './pages/Settings';
import Planning from './pages/Planning';
import clsx from 'clsx';
import { Toaster } from 'react-hot-toast';
import { ProcessingProvider } from './contexts/ProcessingContext';

function App() {
    return (
        <BrowserRouter>
            <ProcessingProvider>
                <Toaster position="top-right" />
                <div className="min-h-screen bg-muted/30 flex">
                    {/* Sidebar */}
                    <aside className="w-64 bg-card border-r border-border flex flex-col shadow-sm">
                        <div className="p-5 border-b border-border">
                            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2.5">
                                <div className="p-2 bg-primary rounded-lg">
                                    <Wallet className="w-5 h-5 text-primary-foreground" />
                                </div>
                                Spend Analyzer
                            </h1>
                        </div>

                        <nav className="flex-1 p-3 space-y-1">
                            <NavItem to="/" icon={<LayoutDashboard className="w-5 h-5" />}>
                                Dashboard
                            </NavItem>
                            <NavItem to="/upload" icon={<Upload className="w-5 h-5" />}>
                                Upload
                            </NavItem>
                            <NavItem to="/statements" icon={<FileText className="w-5 h-5" />}>
                                Statements
                            </NavItem>
                            <NavItem to="/transactions" icon={<Receipt className="w-5 h-5" />}>
                                Transactions
                            </NavItem>
                            <NavItem to="/categories" icon={<Tags className="w-5 h-5" />}>
                                Categories
                            </NavItem>
                            <NavItem to="/insights" icon={<Lightbulb className="w-5 h-5" />}>
                                Insights
                            </NavItem>
                            <NavItem to="/analysis" icon={<Sparkles className="w-5 h-5" />}>
                                Analysis
                            </NavItem>
                            <NavItem to="/planning" icon={<CalendarDays className="w-5 h-5" />}>
                                Planning
                            </NavItem>
                            <NavItem to="/settings" icon={<SettingsIcon className="w-5 h-5" />}>
                                Settings
                            </NavItem>
                        </nav>

                        <div className="p-4 border-t border-border">
                            <p className="text-xs text-muted-foreground">
                                Local Spend Analyzer v1.0
                            </p>
                        </div>
                    </aside>

                    {/* Main content */}
                    <main className="flex-1 overflow-auto">
                        <Routes>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="/upload" element={<UploadPage />} />
                            <Route path="/statements" element={<Statements />} />
                            <Route path="/statements/:id" element={<StatementDetail />} />
                            <Route path="/transactions" element={<Transactions />} />
                            <Route path="/categories" element={<Categories />} />
                            <Route path="/insights" element={<Insights />} />
                            <Route path="/analysis" element={<Analysis />} />
                            <Route path="/planning" element={<Planning />} />
                            <Route path="/settings" element={<Settings />} />
                        </Routes>
                    </main>
                </div>
            </ProcessingProvider>
        </BrowserRouter>
    );
}

function NavItem({
    to,
    icon,
    children,
}: {
    to: string;
    icon: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <NavLink
            to={to}
            className={({ isActive }) =>
                clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                    isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )
            }
        >
            {icon}
            {children}
        </NavLink>
    );
}

export default App;
