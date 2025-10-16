import * as WEBIFC from "web-ifc";

/**
 * Restituisce i nomi delle classi IFC corrispondenti ai codici numerici forniti.
 *
 * @param codes - Array di codici numerici IFC
 * @returns Array di nomi di classi IFC corrispondenti
 */
export function getIFCClassNamesFromCodes(codes: number[]): string[] {
    return codes.map(code => {
        const className = Object.keys(WEBIFC).find(
        key => (WEBIFC as any)[key] === code
        );
        return className || `UNKNOWN_TYPE_${code}`;
    });
    }