import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const Tooltip = ({ children, text, side = 'bottom' }: { children: React.ReactNode, text: string, side?: 'top' | 'bottom' | 'left' | 'right' }) => {
  const [visible, setVisible] = useState(false);

  const positions = {
    top: "bottom-full mb-2 left-1/2 -translate-x-1/2",
    bottom: "top-full mt-2 left-1/2 -translate-x-1/2",
    left: "right-full mr-2 top-1/2 -translate-y-1/2",
    right: "left-full ml-2 top-1/2 -translate-y-1/2"
  };

  const arrows = {
    top: "bottom-[-4px] left-1/2 -translate-x-1/2 rotate-45 border-b border-r",
    bottom: "-top-1 left-1/2 -translate-x-1/2 rotate-45 border-t border-l",
    left: "right-[-4px] top-1/2 -translate-y-1/2 rotate-45 border-t border-r",
    right: "left-[-4px] top-1/2 -translate-y-1/2 rotate-45 border-b border-l"
  };

  return (
    <div className="relative flex items-center justify-center shrink-0" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      {children}
      <AnimatePresence>
        {visible && (
          <div className={`absolute z-[100] pointer-events-none ${ positions[side] }`}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: side === 'top' ? 4 : side === 'bottom' ? -4 : 0 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className={`relative px-2.5 py-1.5 bg-[#000000] border border-white/10 text-white text-[12px] font-medium rounded-lg shadow-2xl whitespace-nowrap`}
            >
              {text}
              <div className={`absolute w-2 h-2 bg-[#000000] border-white/10 ${ arrows[side] }`} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
