import React from 'react';

const FONT = 'Inter, "IBM Plex Sans", "PingFang SC", "Microsoft YaHei", sans-serif';
const SERIF = 'Newsreader, Georgia, "Songti SC", serif';

function canvasBackground(tokens) {
  return tokens.visualPreset?.backgroundCss
    || tokens.profile?.backgroundCss
    || `radial-gradient(circle at 85% 15%,${tokens.accent}24,transparent 38%),linear-gradient(135deg,transparent,${tokens.secondary}12)`;
}

export function Frame({ tokens, children, page = '01', inverse = false }) {
  const bg = inverse ? tokens.foreground : tokens.background;
  const fg = inverse ? tokens.background : tokens.foreground;
  const density=tokens.density==='compact'?46:tokens.density==='spacious'?72:58;
  return <div className="theme-frame" data-grammar={tokens.visualPreset?.grammar} style={{ width:'100%', height:'100%', boxSizing:'border-box', overflow:'hidden', position:'relative', padding:`54px ${density}px`, backgroundColor:bg, color:fg, fontFamily:tokens.profile?.body||FONT, backgroundImage:canvasBackground(tokens), backgroundRepeat:'no-repeat', backgroundSize:'cover' }}>
    {tokens.showChrome !== false && <div style={{ position:'absolute', top:26, left:64, right:64, display:'flex', justifyContent:'space-between', fontSize:11, letterSpacing:'0.16em', textTransform:'uppercase', opacity:.72 }}><span>DASHI / {tokens.motif}</span><span>{tokens.total ? `${page} / ${tokens.total}` : page}</span></div>}
    {children}
  </div>;
}

export const Eyebrow = ({ children, tokens }) => <div className="theme-eyebrow" style={{ color:tokens.accent, fontWeight:800, fontSize:15, letterSpacing:'.16em', textTransform:'uppercase', marginBottom:18 }}>{children}</div>;
export const Title = ({ children, size=58, serif=false }) => <div className="theme-heading" style={{ fontFamily:serif?SERIF:undefined, fontSize:size, lineHeight:1.02, fontWeight:serif?600:800 }}>{children}</div>;
export const Body = ({ children, width=780 }) => <div className="theme-body" style={{ fontSize:22, lineHeight:1.55, opacity:.78, maxWidth:width }}>{children}</div>;
