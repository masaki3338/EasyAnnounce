import { Worker, Viewer } from "@react-pdf-viewer/core";
import { defaultLayoutPlugin } from "@react-pdf-viewer/default-layout";
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';

const ManualViewer = () => {
  const defaultLayoutPluginInstance = defaultLayoutPlugin();

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        overflow: "auto",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <Worker workerUrl="/pdf.worker.min.js">
        <Viewer
          fileUrl="/manual.pdf"
          plugins={[defaultLayoutPluginInstance]}
        />
      </Worker>
    </div>
  );
};

export default ManualViewer;
