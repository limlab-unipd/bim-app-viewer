import { tableFromIPC } from 'apache-arrow'
import { addOverlay } from './addOverlay'
import * as BUI from '@thatopen/ui'

export async function readArrow(file:string='buildings') {
    addOverlay(BUI.html`Loading data ...`)

    const startTime = performance.now() // Start timer
    let resp
    
    if (file=='suburbs' || file=='boundaries'){
        resp = await fetch('/ARROW/ACT_boundaries.arrow')
    } else {
        resp = await fetch('/ARROW/ACT_materials.arrow')
    }

    if (!resp.ok) throw new Error(`Errore fetch: ${resp.status}`)
    const buffer = await resp.arrayBuffer()
    const table = tableFromIPC(new Uint8Array(buffer)) // legge il file come Table
    //console.log('Numero righe:', table.numRows)
    //console.log('Numero colonne:', table.numCols)

    const endTime = performance.now() // End timer
    const loadTime = ((endTime - startTime) / 1000).toFixed(2) // seconds
    console.log(`Arrow ${file} loaded in ${loadTime} seconds`)

    addOverlay(BUI.html`Data correctly loaded in ${loadTime}s!`)
    
    return table
}