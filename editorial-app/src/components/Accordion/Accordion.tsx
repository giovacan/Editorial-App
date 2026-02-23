import { useState, memo } from 'react';
import './Accordion.css';

interface AccordionItem {
  id: string;
  title: string;
  icon?: string;
  content: React.ReactNode;
}

interface AccordionProps {
  items: AccordionItem[];
  defaultOpen?: string;
}

function Accordion({ items, defaultOpen }: AccordionProps) {
  const [openId, setOpenId] = useState<string | null>(defaultOpen || null);

  const toggle = (id: string) => {
    setOpenId(openId === id ? null : id);
  };

  return (
    <div className="accordion">
      {items.map((item) => (
        <div key={item.id} className={`accordion-item ${openId === item.id ? 'open' : ''}`}>
          <button 
            className="accordion-header"
            onClick={() => toggle(item.id)}
            aria-expanded={openId === item.id}
          >
            <span className="accordion-icon">{item.icon || '📄'}</span>
            <span className="accordion-title">{item.title}</span>
            <span className="accordion-arrow">▼</span>
          </button>
          {openId === item.id && (
            <div className="accordion-content">
              {item.content}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default memo(Accordion);
