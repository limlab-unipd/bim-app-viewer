import { tableFromIPC } from 'apache-arrow';

export async function readArrow() {
    const startTime = performance.now() // Start timer 
    
    const resp = await fetch('/ARROW/data_local_coordinates_sliced.arrow');
    if (!resp.ok) throw new Error(`Errore fetch: ${resp.status}`);
    const buffer = await resp.arrayBuffer();
    const table = tableFromIPC(new Uint8Array(buffer)); // legge il file come Table
    //console.log('Numero righe:', table.numRows);
    //console.log('Numero colonne:', table.numCols);

    const endTime = performance.now() // End timer
    const loadTime = ((endTime - startTime) / 1000).toFixed(2) // seconds
    console.log(`Arrow loaded in ${loadTime} seconds`)
    // arrow completo (168 MB) --> 11.51 s
    // arrow sliced (40 MB) --> 0.68 - 1.99 s
    
    return table;
}