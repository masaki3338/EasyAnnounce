import React, { useEffect } from "react";

const Gather: React.FC = () => {
  const message = "両チームの選手はベンチ前にお集まりください。";

  useEffect(() => {
    const utter = new SpeechSynthesisUtterance(message);
    utter.lang = "ja-JP";
    speechSynthesis.speak(utter);
  }, []);

  return (
    <div className="p-6 text-center">
      <h1 className="text-2xl font-bold mb-6">集合アナウンス</h1>
      <p className="text-xl">{message}</p>
    </div>
  );
};

export default Gather;
