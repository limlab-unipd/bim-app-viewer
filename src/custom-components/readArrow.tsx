import { tableFromIPC } from 'apache-arrow'
import { addOverlay } from './addOverlay'
import * as BUI from '@thatopen/ui'

export async function readArrow(file:string='buildings') {
    addOverlay(BUI.html`Loading data ...`)

    const startTime = performance.now() // Start timer
    let resp
    
    if (file=='suburbs'){
        resp = await fetch('/ARROW/data_ACT suburbs_local_coordinates_sliced.arrow')
    } else if (file=='suburbs-boundaries') {
        resp = await fetch('/ARROW/data_ACT suburbs_global_coordinates_sliced.arrow')
    } else {
        resp = await fetch('/ARROW/data_local_coordinates_sliced.arrow')
    }

    if (!resp.ok) throw new Error(`Errore fetch: ${resp.status}`)
    const buffer = await resp.arrayBuffer()
    const table = tableFromIPC(new Uint8Array(buffer)) // legge il file come Table
    //console.log('Numero righe:', table.numRows)
    //console.log('Numero colonne:', table.numCols)

    const endTime = performance.now() // End timer
    const loadTime = ((endTime - startTime) / 1000).toFixed(2) // seconds
    console.log(`Arrow ${file} loaded in ${loadTime} seconds`)

    addOverlay(BUI.html`Data correctly loaded!`)
    
    return table
}