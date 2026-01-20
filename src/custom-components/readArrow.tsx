import { tableFromIPC } from 'apache-arrow'
import { addOverlay } from './addOverlay'
import * as BUI from '@thatopen/ui'

type ArrowFile = 'materials' | 'boundaries' | 'population' | 'environmental' | 'boundaries_sa1'

/**
 * Loads an Arrow file corresponding to one of the available datasets
 * (materials, boundaries, population, environmental, 'boundaries_sa1') and returns it as
 * an Arrow Table. The function selects the appropriate file based on the
 * input parameter, downloads it, displays loading status through an overlay,
 * measures the loading time, and finally returns the decoded table.
 *
 * @param file Type of Arrow file to load. Allowed values: 'materials',
 *             'boundaries', 'boundaries_sa1', 'population', 'environmental'. Default: 'materials'.
 * @returns A Promise resolving to an Arrow Table containing the loaded data.
 * @throws Error if the fetch fails or if the provided file type is invalid.
 */
export async function readArrow(file: ArrowFile = 'materials') {

    const startTime = performance.now() // Start timer
    let loadedFile: string = ''
    let resp
    
    if (file=='boundaries'){
        resp = await fetch('/ARROW/ACT_boundaries.arrow')
        loadedFile = 'Suburbs boundaries'
    } else if (file=='boundaries_sa1') {
        resp = await fetch('/ARROW/ACT_boundaries_sa1.arrow')
        loadedFile = 'Population'
    } else if (file=='population') {
        resp = await fetch('/ARROW/ACT_population.arrow')
        loadedFile = 'Population'
    } else if (file=='environmental') {
        resp = await fetch('/ARROW/ACT_environmental.arrow')
        loadedFile = 'Environmental impacts'
    } else if (file=='materials') {
        loadedFile = 'Materials quantities'
        resp = await fetch('/ARROW/ACT_materials.arrow')
    } else {
        console.warn('Arrow file not found')
        return
    }

    addOverlay(BUI.html`Loading <b><i>${loadedFile}</i></b> data ...`)

    if (!resp.ok) throw new Error(`Errore fetch: ${resp.status}`)
    const buffer = await resp.arrayBuffer()
    const table = tableFromIPC(new Uint8Array(buffer)) // legge il file come Table
    //console.log('Numero righe:', table.numRows)
    //console.log('Numero colonne:', table.numCols)

    const endTime = performance.now() // End timer
    const loadTime = ((endTime - startTime) / 1000).toFixed(2) // seconds
    console.log(`Arrow ${file} loaded in ${loadTime} seconds`)

    addOverlay(BUI.html`<b><i>${loadedFile}</i></b> data correctly loaded in ${loadTime}s!`)
    
    return table
}