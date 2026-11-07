import EditorApp from "../../EditorApp";

// the link is the password: anyone with a long random room id can join. params is a Promise in Next 16.
export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
    const { roomId } = await params;
    return <EditorApp roomId={roomId} />;
}
