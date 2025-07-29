import { Worker, Viewer } from "@react-pdf-viewer/core";
import "@react-pdf-viewer/core/lib/styles/index.css";
import "@react-pdf-viewer/default-layout/lib/styles/index.css";
import { defaultLayoutPlugin } from "@react-pdf-viewer/default-layout";

const ManualViewer = () => {
  const defaultLayoutPluginInstance = defaultLayoutPlugin();

  return (
    <div
    style={{
        width: "100%",
        height: "100vh", // minHeight → height に
        overflow: "auto", // overflowY ではなく overflow
        WebkitOverflowScrolling: "touch", // iOSの慣性スクロール
    }}
    >
        <Worker workerUrl={`https://unpkg.com/pdfjs-dist@3.4.120/build/pdf.worker.min.js`}>
        <Viewer
          fileUrl="/manual.pdf"
          plugins={[defaultLayoutPluginInstance]}
        />
      </Worker>
    </div>
  );
};

export default ManualViewer;
