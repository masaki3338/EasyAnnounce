import React, { useEffect,useRef, useState } from "react";
import localForage from "localforage";
import * as wanakana from "wanakana";



type Player = {
  id: number;
  lastName: string;
  firstName: string;
  lastNameKana: string;
  firstNameKana: string;
  number: string;
  isFemale: boolean;
};

type Team = {
  name: string;
  furigana: string;
  players: Player[];
};



const TeamRegister = () => {
  const [team, setTeam] = useState<Team>({
    name: "",
    furigana: "",
    players: [],
  });

  const lastNameInputRef = useRef<HTMLInputElement>(null);
  const [restoreMessage, setRestoreMessage] = useState("");

  const handleBackup = () => {
    const blob = new Blob([JSON.stringify(team, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "team_backup.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      setTeam(data);
      setRestoreMessage("✅ バックアップを読み込みました。必要なら保存ボタンを押してください。");
    } catch (error) {
      setRestoreMessage("❌ 読み込みに失敗しました。ファイル形式を確認してください。");
    }
  };


  const [editingPlayer, setEditingPlayer] = useState<Partial<Player>>({});

useEffect(() => {
  if (editingPlayer.id && typeof window !== "undefined") {
    setTimeout(() => {
      lastNameInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      lastNameInputRef.current?.focus();
    }, 100);
  }
}, [editingPlayer.id]);

  useEffect(() => {
    localForage.getItem<Team>("team").then((data) => {
      if (data) setTeam(data);
    });
  }, []);

  const handleTeamChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    setTeam((prev) => {
      if (name === "name") {
        const currentFurigana = prev.furigana;
        const autoFurigana = wanakana.toHiragana(value);
        const isAutoFurigana = currentFurigana === wanakana.toHiragana(prev.name);
        return {
          ...prev,
          name: value,
          furigana: isAutoFurigana ? autoFurigana : currentFurigana,
        };
      } else {
        return { ...prev, [name]: value };
      }
    });
  };

  const handlePlayerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setEditingPlayer((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  useEffect(() => {
    if (editingPlayer.lastName && !editingPlayer.lastNameKana) {
      setEditingPlayer((prev) => ({
        ...prev,
        lastNameKana: wanakana.toHiragana(editingPlayer.lastName),
      }));
    }
  }, [editingPlayer.lastName, editingPlayer.lastNameKana]);

  useEffect(() => {
    if (editingPlayer.firstName && !editingPlayer.firstNameKana) {
      setEditingPlayer((prev) => ({
        ...prev,
        firstNameKana: wanakana.toHiragana(editingPlayer.firstName),
      }));
    }
  }, [editingPlayer.firstName, editingPlayer.firstNameKana]);

  const addOrUpdatePlayer = () => {
    if (!editingPlayer.lastName || !editingPlayer.firstName || !editingPlayer.number) return;

    setTeam((prev) => {
      const existingIndex = prev.players.findIndex((p) => p.id === editingPlayer.id);
      const newPlayer: Player = {
        id: editingPlayer.id ?? Date.now(),
        lastName: editingPlayer.lastName!,
        firstName: editingPlayer.firstName!,
        lastNameKana: editingPlayer.lastNameKana ?? wanakana.toHiragana(editingPlayer.lastName!),
        firstNameKana: editingPlayer.firstNameKana ?? wanakana.toHiragana(editingPlayer.firstName!),
        number: editingPlayer.number!,
        isFemale: editingPlayer.isFemale ?? false,
      };

      const updatedPlayers =
        existingIndex >= 0
          ? [...prev.players.slice(0, existingIndex), newPlayer, ...prev.players.slice(existingIndex + 1)]
          : [...prev.players, newPlayer];

      return { ...prev, players: updatedPlayers };
    });

    setEditingPlayer({});
  };

  const editPlayer = (player: Player) => setEditingPlayer(player);

  const deletePlayer = (id: number) =>
    setTeam((prev) => ({
      ...prev,
      players: prev.players.filter((p) => p.id !== id),
    }));

  const saveTeam = async () => {
    const updatedTeam = {
      ...team,
      furigana: wanakana.toHiragana(team.name),
      players: [...team.players].sort((a, b) => Number(a.number) - Number(b.number)),
    };
    await localForage.setItem("team", updatedTeam);
    alert("✅ チーム情報を保存しました");
  };

  return (
    <div className="max-w-md mx-auto px-4 py-6 bg-gray-50 min-h-screen">
    <h1 className="text-2xl font-bold text-center text-blue-700 mb-6">🏏 チーム／選手登録</h1>

    <div className="flex gap-3 justify-center mt-4 mb-2">
      <button
        onClick={handleBackup}
        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
      >
        📁 バックアップ保存
      </button>

      <label className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded cursor-pointer">
        📂 バックアップ読み込み
        <input
          type="file"
          accept="application/json"
          onChange={handleRestore}
          style={{ display: "none" }}
        />
      </label>
    </div>

    {restoreMessage && (
      <p className="text-sm text-center text-red-600 mb-4">{restoreMessage}</p>
    )}

      {/* チーム情報入力 */}
      <div className="space-y-4 bg-white rounded-xl shadow p-4 mb-6">
        <div>
          <label htmlFor="teamName" className="block text-sm font-semibold text-gray-700">
            チーム名
          </label>
          <input
            id="teamName"
            type="text"
            name="name"
            value={team.name}
            onChange={handleTeamChange}
            className="border border-gray-300 rounded px-3 py-2 w-full mt-1"
            placeholder="例：広島カープ"
          />
        </div>
        <div>
          <label htmlFor="teamFurigana" className="block text-sm font-semibold text-gray-700">
            ふりがな
          </label>
          <input
            id="teamFurigana"
            type="text"
            name="furigana"
            value={team.furigana}
            onChange={handleTeamChange}
            className="border border-gray-300 rounded px-3 py-2 w-full mt-1"
            placeholder="例：ひろしまかーぷ"
          />
        </div>
      </div>

      {/* 選手追加フォーム */}
      <div className="bg-white rounded-xl shadow p-4 mb-6">
        <h2 className="text-lg font-bold text-blue-600 mb-4">{editingPlayer.id ? "選手を編集" : "選手を追加"}</h2>

        {[
          { id: "lastName", label: "姓", placeholder: "例：山田" },

          { id: "lastNameKana", label: "ふりがな（姓）", placeholder: "やまだ" },
          { id: "firstName", label: "名", placeholder: "例：太郎" },
          { id: "firstNameKana", label: "ふりがな（名）", placeholder: "たろう" },
          { id: "number", label: "背番号", placeholder: "10" },
        ].map(({ id, label, placeholder }) => (
          <div key={id} className="mb-3">
            <label htmlFor={id} className="block text-sm font-semibold text-gray-700">
              {label}
            </label>
            <input
              id={id}
              name={id}
              ref={id === "lastName" ? lastNameInputRef : undefined} // 
              value={(editingPlayer as any)[id] || ""}
              onChange={handlePlayerChange}
              className="border border-gray-300 rounded px-3 py-2 w-full mt-1"
              placeholder={placeholder}
            />
          </div>
        ))}

        <label className="inline-flex items-center mt-2 mb-4">
          <input
            type="checkbox"
            name="isFemale"
            checked={editingPlayer.isFemale || false}
            onChange={handlePlayerChange}
            className="mr-2"
          />
          女子選手
        </label>

        <button
          onClick={addOrUpdatePlayer}
          className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl text-lg font-semibold transition"
        >
          {editingPlayer.id ? "✅ 更新" : "➕ 追加"}
        </button>
      </div>

      {/* 選手一覧 */}
      <div className="bg-white rounded-xl shadow p-4 mb-6">
        <h2 className="text-lg font-bold text-blue-600 mb-4">👥 登録済み選手</h2>
        <ul className="space-y-3">
          {team.players
            .sort((a, b) => Number(a.number) - Number(b.number))
            .map((p) => (
              <li key={p.id} className="border rounded-lg p-3 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium">
                    背番号 {p.number}：{p.lastName} {p.firstName} {p.isFemale ? "(女子)" : ""}
                  </p>
                  <p className="text-xs text-gray-500">{p.lastNameKana} {p.firstNameKana}</p>
                </div>
                <div className="flex gap-3 text-sm">
                  <button onClick={() => editPlayer(p)} className="text-blue-600 font-semibold">
                    編集
                  </button>
                  <button onClick={() => deletePlayer(p.id)} className="text-red-500 font-semibold">
                    削除
                  </button>
                </div>
              </li>
            ))}
        </ul>
      </div>

      <button
        onClick={saveTeam}
        className="w-full bg-blue-700 hover:bg-blue-800 text-white py-4 rounded-xl text-lg font-bold"
      >
        💾 保存する
      </button>
    </div>
  );
};

export default TeamRegister;
