import React from 'react';

const CollabCursors = ({ cursors }) => (
  <div style={{
    position: 'fixed', top: 0, left: 0,
    width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: 9999
  }}>
    {Object.entries(cursors || {}).map(([id, { x, y, name, color }]) => (
      <div key={id} style={{
        position: 'absolute',
        left: x, top: y,
        transform: 'translate(-2px, -2px)'
      }}>
        <svg width="20" height="20" viewBox="0 0 20 20">
          <path
            d="M0,0 L0,16 L4,12 L8,20 L10,19 L6,11 L12,11 Z"
            fill={color} stroke="white" strokeWidth="1"
          />
        </svg>
        <span style={{
          background: color, color: 'white',
          fontSize: '11px', padding: '2px 6px',
          borderRadius: '4px', marginLeft: '4px',
          whiteSpace: 'nowrap'
        }}>
          {name}
        </span>
      </div>
    ))}
  </div>
);

export default CollabCursors;
