export function InfoPage() {
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
        {/* Header */}
        <header style={{ textAlign: "center", marginBottom: "2rem" }}>
            <h1 style={{ fontSize: "2.5rem", fontWeight: "bold", color: "white" }}>
            Ygor Fasanella
            </h1>
        </header>

        {/* Card: Chi sono */}
        <section
            className="info-card"
        >
            <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Who I am</h2>
            <p style={{ lineHeight: 1.8, paddingLeft: "1.2rem" }}>
                Coming soon ...
            </p>
        </section>

        {/* Card: Esperienza */}
        <section
            className="info-card"
        >
            <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
                Experience
            </h2>
            <ul style={{ lineHeight: 1.8, paddingLeft: "1.2rem" }}>
            <li>
                <strong>Example: </strong>
                Coming soon ...
            </li>
            </ul>
        </section>

        {/* Card: Contatti */}
        <section
            className="info-card"
        >
            <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Contacts</h2>
            <ul style={{ lineHeight: 1.8, paddingLeft: "1.2rem" }}>
            <li>
                <strong>Mail: </strong><a href="mailto:ygor.fasanella@phd.unipd.it">ygor.fasanella@phd.unipd.it</a>
            </li>
            <li>
                <a>Coming soon ...</a>
            </li>
            </ul>
        </section>

        </div>
    );
}
