import { useState } from "react";
import CursorTracking from "./CursorTracking";

function App() {
  const [showTracking, setShowTracking] = useState(true);

  return (
    <>
      <div
        className={`${showTracking ? "bg-purple-900" : "bg-cyan-900"} flex h-screen w-full flex-col items-center`}
      >
        <div className="flex flex-col container h-full">
          <div className="flex flex-row justify-center">
            <button
              className={`border rounded text-base font-medium border-white px-4 py-2 m-4 text-white cursor-pointer transition-colors duration-200 hover:bg-white ${showTracking ? "hover:text-purple-900" : "hover:text-cyan-900"}`}
              onClick={() => setShowTracking(!showTracking)}
            >
              Switch tracking method
            </button>
          </div>
          {showTracking ? <CursorTracking /> : <></>}
        </div>
      </div>
    </>
  );
}

export default App;
