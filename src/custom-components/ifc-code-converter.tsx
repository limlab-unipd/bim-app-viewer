import * as WEBIFC from "web-ifc";

/**
 * Returns the names of the IFC classes corresponding to the provided numeric codes.
 *
 * @param codes - Array of IFC numeric codes
 * @returns Array of corresponding IFC class names
 */
export function getIFCClassNamesFromCodes(codes: number[]): string[] {
    return codes.map(code => {
        const className = Object.keys(WEBIFC).find(
        key => (WEBIFC as any)[key] === code
        );
        return className || `UNKNOWN_TYPE_${code}`;
    });
}

/**
 * Returns the numeric IFC codes corresponding to the provided class names.
 *
 * @param classNames - Array of IFC class names
 * @returns Array of corresponding IFC numeric codes
 */
export function getIFCCodesFromClassNames(classNames: string[]): number[] {
    return classNames.map(name => {
        const code = (WEBIFC as any)[name];
        return code !== undefined ? code : -1; // use -1 if class name is not found
    });
}
