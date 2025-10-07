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
                <h1 className="pages-header">HOME PAGE</h1>
                <p style={{ fontSize: "1.1rem", color: "white" }}>
                    Coming soon ...
                </p>
            </header>

        </div>
    );
}
