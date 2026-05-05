import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
  Sun, 
  Moon, 
  Globe, 
  LogOut, 
  Menu, 
  FolderOpen, 
  ShieldAlert, 
  ChevronDown
} from 'lucide-react';

export default function Navbar({ isSidebarOpen, setIsSidebarOpen, title, subtitle }) {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isLangOpen, setIsLangOpen] = useState(false);

  const languages = [
    { code: 'en', label: 'English' },
    { code: 'hi', label: 'हिंदी' },
    { code: 'kn', label: 'ಕನ್ನಡ' }
  ];

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
    setIsLangOpen(false);
  };

  useEffect(() => {
    const handleClick = () => setIsLangOpen(false);
    if (isLangOpen) {
      window.addEventListener('click', handleClick);
    }
    return () => window.removeEventListener('click', handleClick);
  }, [isLangOpen]);

  return (
    <nav className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border transition-all duration-300">
      <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            {isSidebarOpen ? <Menu size={20} /> : <FolderOpen size={20} />}
          </button>
          
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
            <ShieldAlert size={18} />
          </div>
          
          <div>
            <h1 className="text-lg font-bold tracking-tight leading-none hidden sm:block">
              {title || t('common.dashboard')}
            </h1>
            <p className="text-[10px] text-primary font-bold uppercase tracking-widest mt-0.5 hidden sm:block">
              {subtitle || "GovOS AI Platform"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-muted text-muted-foreground hover:text-primary transition-all duration-200 hover:scale-110 active:scale-95"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          {/* Language Switcher */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsLangOpen(!isLangOpen);
              }}
              className="p-2 rounded-lg bg-muted text-muted-foreground hover:text-primary transition-all duration-200 flex items-center gap-1"
            >
              <Globe size={18} />
              <ChevronDown size={14} className={`transition-transform duration-300 ${isLangOpen ? 'rotate-180' : ''}`} />
            </button>

            {isLangOpen && (
              <div className="absolute right-0 mt-2 w-32 bg-popover border border-border rounded-lg shadow-lg py-1.5 z-[60] animate-in fade-in zoom-in duration-150">
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => changeLanguage(lang.code)}
                    className={`w-full text-left px-4 py-2 text-xs transition-colors ${
                      i18n.language === lang.code 
                        ? 'bg-primary/10 text-primary font-bold' 
                        : 'text-foreground/70 hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="h-6 w-px bg-border mx-1 hidden sm:block"></div>

          {/* User Info & Logout */}
          <div className="flex items-center gap-3 pl-4 border-l border-border">
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-sm font-bold truncate max-w-[150px]">
                {user?.name || "User"}
              </span>
              <span className="text-[10px] font-bold text-primary uppercase tracking-widest">
                {user?.role ? t(`roles.${user.role}`) : t('roles.user')}
              </span>
            </div>
            
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="p-2.5 rounded-lg bg-muted text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-all duration-200 group"
              title={t('common.logout')}
            >
              <LogOut size={18} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
