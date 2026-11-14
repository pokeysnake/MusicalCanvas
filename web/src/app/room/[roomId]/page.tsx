import EditorApp from "../../EditorApp";

// the link is the password: anyone with a long random room id can join. params is a Promise in Next 16.
export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
    const { roomId } = await params;
    // key: loading a file inside a room moves to a NEW room id; a fresh editor means no leftover state from the old one
    return <EditorApp key={roomId} roomId={roomId} />;
}
