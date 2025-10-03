export function HomePage() {
    return (
        <div
            style={{
                flex: 1,
                padding: "2rem",
                overflowY: "auto",
                fontFamily: "Arial, sans-serif",
                backgroundColor: 'var(--background)',
                color: "#333",
            }}
            >

            <header style={{ textAlign: "center", marginBottom: "2rem" }}>
                <h1 style={{ fontSize: "2.5rem", fontWeight: "bold", color: "white" }}>
                HOME PAGE
                </h1>
                <p style={{ fontSize: "1.1rem", color: "white" }}>
                    Coming soon ...
                </p>
            </header>

        </div>
    );
}
