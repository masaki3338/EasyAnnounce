import React, { useEffect, useState } from "react";
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

  const [editingPlayer, setEditingPlayer] = useState<Partial<Player>>({});

  useEffect(() => {
    localForage.getItem<Team>("team").then((data) => {
      if (data) setTeam(data);
    });
  }, []);

  const handleTeamChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    setTeam((prev) => {
      if (name === "name") {
        // チーム名が変わった時にふりがな自動更新。ただし既にユーザーが手動編集していた場合は上書きしない
        const currentFurigana = prev.furigana;
        const autoFurigana = wanakana.toHiragana(value);
        const isAutoFurigana = currentFurigana === wanakana.toHiragana(prev.name);
        return {
          ...prev,
          name: value,
          furigana: isAutoFurigana ? autoFurigana : currentFurigana,
        };
      } else {
        // ふりがなの直接編集はこちら
        return {
          ...prev,
          [name]: value,
        };
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

  // 選手のふりがな自動更新（漢字が変わったら）
  useEffect(() => {
    if (editingPlayer.lastName) {
      setEditingPlayer((prev) => ({
        ...prev,
        lastNameKana: wanakana.toHiragana(editingPlayer.lastName || ""),
      }));
    }
  }, [editingPlayer.lastName]);

  useEffect(() => {
    if (editingPlayer.firstName) {
      setEditingPlayer((prev) => ({
        ...prev,
        firstNameKana: wanakana.toHiragana(editingPlayer.firstName || ""),
      }));
    }
  }, [editingPlayer.firstName]);

  const addOrUpdatePlayer = () => {
    if (!editingPlayer.lastName || !editingPlayer.firstName || !editingPlayer.number) return;

    setTeam((prev) => {
      const existingIndex = prev.players.findIndex((p) => p.id === editingPlayer.id);
      const newPlayer: Player = {
        id: editingPlayer.id ?? Date.now(),
        lastName: editingPlayer.lastName!,
        firstName: editingPlayer.firstName!,
        lastNameKana:
          editingPlayer.lastNameKana ?? wanakana.toHiragana(editingPlayer.lastName!),
        firstNameKana:
          editingPlayer.firstNameKana ?? wanakana.toHiragana(editingPlayer.firstName!),
        number: editingPlayer.number!,
        isFemale: editingPlayer.isFemale ?? false,
      };

      const updatedPlayers =
        existingIndex >= 0
          ? [
              ...prev.players.slice(0, existingIndex),
              newPlayer,
              ...prev.players.slice(existingIndex + 1),
            ]
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
    <div className="max-w-xl mx-auto mt-8 p-4">
      <h1 className="text-2xl font-bold mb-4 text-center">チーム／選手登録</h1>

      <div className="mb-4">
        <label htmlFor="teamName" className="block font-bold mb-1">
          チーム名
        </label>
        <input
          id="teamName"
          type="text"
          name="name"
          value={team.name}
          onChange={handleTeamChange}
          className="border p-2 w-full mb-1"
        />
        <label htmlFor="teamFurigana" className="block font-bold mb-1">
          ふりがな
        </label>
        <input
          id="teamFurigana"
          type="text"
          name="furigana"
          value={team.furigana}
          onChange={handleTeamChange}
          className="border p-2 w-full"
          placeholder="チーム名のふりがなを入力"
        />
      </div>

      <div className="mb-4 border-t pt-4">
        <h2 className="font-bold mb-2">{editingPlayer.id ? "選手を編集" : "選手を追加"}</h2>

        <div className="mb-2">
          <label htmlFor="lastName" className="block font-semibold mb-1">
            姓
          </label>
          <input
            id="lastName"
            name="lastName"
            placeholder="姓"
            value={editingPlayer.lastName || ""}
            onChange={handlePlayerChange}
            className="border p-2 w-full"
          />
          <label htmlFor="lastNameKana" className="block font-semibold mb-1 mt-1">
            ふりがな（姓）
          </label>
          <input
            id="lastNameKana"
            name="lastNameKana"
            placeholder="ふりがな（姓）"
            value={editingPlayer.lastNameKana || ""}
            onChange={handlePlayerChange}
            className="border p-2 w-full"
          />
        </div>

        <div className="mb-2">
          <label htmlFor="firstName" className="block font-semibold mb-1">
            名
          </label>
          <input
            id="firstName"
            name="firstName"
            placeholder="名"
            value={editingPlayer.firstName || ""}
            onChange={handlePlayerChange}
            className="border p-2 w-full"
          />
          <label htmlFor="firstNameKana" className="block font-semibold mb-1 mt-1">
            ふりがな（名）
          </label>
          <input
            id="firstNameKana"
            name="firstNameKana"
            placeholder="ふりがな（名）"
            value={editingPlayer.firstNameKana || ""}
            onChange={handlePlayerChange}
            className="border p-2 w-full"
          />
        </div>

        <div className="mb-2">
          <label htmlFor="number" className="block font-semibold mb-1">
            背番号
          </label>
          <input
            id="number"
            name="number"
            placeholder="背番号"
            value={editingPlayer.number || ""}
            onChange={handlePlayerChange}
            className="border p-2 w-full"
          />
        </div>

        <label className="flex items-center gap-2 mb-2">
          <input
            type="checkbox"
            name="isFemale"
            checked={editingPlayer.isFemale || false}
            onChange={handlePlayerChange}
          />
          女子選手
        </label>

        <button onClick={addOrUpdatePlayer} className="bg-green-500 text-white px-4 py-2 rounded">
          {editingPlayer.id ? "更新" : "追加"}
        </button>
      </div>

      <div className="mb-4 border-t pt-4">
        <h2 className="font-bold mb-2">選手一覧</h2>
        <ul className="space-y-2">
          {[...team.players]
            .sort((a, b) => Number(a.number) - Number(b.number))
            .map((p) => (
              <li
                key={p.id}
                className="border p-2 rounded flex justify-between items-center"
              >
                <div>
                  <div>
                    背番号 {p.number}：{p.lastName} {p.firstName} {p.isFemale ? "(女子)" : ""}
                  </div>
                  <div className="text-sm text-gray-500">
                    {p.lastNameKana} {p.firstNameKana}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="text-blue-500" onClick={() => editPlayer(p)}>
                    編集
                  </button>
                  <button className="text-red-500" onClick={() => deletePlayer(p.id)}>
                    削除
                  </button>
                </div>
              </li>
            ))}
        </ul>
      </div>

      <button
        onClick={saveTeam}
        className="bg-blue-600 text-white px-4 py-2 rounded mt-4 w-full"
      >
        保存
      </button>
    </div>
  );
};

export default TeamRegister;
