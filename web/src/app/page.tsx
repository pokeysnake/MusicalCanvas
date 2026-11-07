import EditorApp from "./EditorApp";

// solo mode: nothing is shared, ops apply locally. /room/[roomId] is the shared version.
export default function Page() {
    return <EditorApp roomId={null} />;
}
