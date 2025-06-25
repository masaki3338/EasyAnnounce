// components/AnnounceSubstitutionModal.tsx
import React, { useEffect } from "react";



interface Props {
  onClose: () => void;
  message: string;
}

const AnnounceSubstitutionModal: React.FC<Props> = ({ onClose, message }) => {
  useEffect(() => {
    const speech = new SpeechSynthesisUtterance(message);
    speech.lang = "ja-JP";
    speechSynthesis.speak(speech);
    speech.onend = onClose; // 読み上げ終了後に自動で閉じる場合

    return () => {
      speechSynthesis.cancel(); // モーダルを閉じた時に読み上げ中止
    };
  }, [message, onClose]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl p-6 w-96 shadow-lg text-center">
        <p className="text-lg font-bold mb-4">守備交代アナウンス中</p>
        <p className="text-gray-700 mb-4">{message}</p>
        <button
          onClick={onClose}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
        >
          閉じる
        </button>
      </div>
    </div>
  );
};

export default AnnounceSubstitutionModal;
