export const c={cotton:'#FBF6EC',indigo:'#152651',navy:'#152651',madder:'#B3261E',turmeric:'#E0A100',mute:'#6B6B6B',ink:'#1B1B1B',green:'#1B7F3B'};
export const card={backgroundColor:'#fff',borderRadius:16,borderCurve:'continuous' as const,padding:16,boxShadow:'0 1px 4px rgba(0,0,0,0.08)'};
export const STATUS:Record<string,[string,string,string]>={ // status -> [emoji, i18n key, colour]
  awaiting_payment:['⏳','st.awaiting_payment',c.turmeric],paid:['🔒','st.paid',c.indigo],shipped:['🚚','st.shipped',c.indigo],
  completed:['✅','st.completed',c.green],refunded:['↩️','st.refunded',c.mute],cancelled:['✖️','st.cancelled',c.mute],disputed:['⚠️','st.disputed',c.madder]};
