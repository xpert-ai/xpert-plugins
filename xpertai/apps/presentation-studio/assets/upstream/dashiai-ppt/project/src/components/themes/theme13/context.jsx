import React from 'react';
import { definition, themeCss } from './theme.js';

export const ThemeContext = React.createContext(definition);
export const useTheme = () => React.useContext(ThemeContext);

export function ThemeProvider({ tokens, children }) {
  const value = React.useMemo(() => ({ ...definition, tokens }), [tokens]);
  return <ThemeContext.Provider value={value}><style>{themeCss}</style><div className="theme13-root" data-frame={definition.profile.frame} style={{width:'100%',height:'100%',position:'relative'}}>{children}</div></ThemeContext.Provider>;
}
