import ReactDOM from "react-dom";

export default function Toast({ message, onClose }) {
  return ReactDOM.createPortal(
    <div className="
      fixed bottom-6 right-6
      z-[9999]
      pointer-events-none
    ">
      <div className="
        flex items-center gap-2
        bg-green-600 text-white
        px-4 py-3 rounded-lg shadow-lg
        pointer-events-auto
        animate-slide-in
      ">
        <svg 
          className="h-5 w-5"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path 
            fillRule="evenodd"
            d="M16.704 5.29a1 1 0 010 1.414l-7.5 7.5a1 1 0 01-1.414 0l-3-3a1 1 0 111.414-1.414L8.5 12.086l6.793-6.793a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-sm font-medium">{message}</span>
      </div>
    </div>,
    document.body
  );
}
