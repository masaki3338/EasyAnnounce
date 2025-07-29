import React from "react";
import { Viewer, Worker } from "@react-pdf-viewer/core";
import { defaultLayoutPlugin } from "@react-pdf-viewer/default-layout";
import "@react-pdf-viewer/core/lib/styles/index.css";
import "@react-pdf-viewer/default-layout/lib/styles/index.css";

const ManualViewer: React.FC = () => {
  const defaultLayoutPluginInstance = defaultLayoutPlugin();

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <Worker workerUrl="/pdf.worker.min.js">
        <Viewer
          fileUrl="/manual.pdf"
          plugins={[defaultLayoutPluginInstance]}
          theme="light"
        />
      </Worker>
    </div>
  );
};

export default ManualViewer;
