// Option lists the product editor and the admin screens receive from the server: already translated and flattened.

/** A category, indented by its depth in the tree. */
export interface CategoryOption {
  id: string;
  label: string;
  depth: number;
}

/** One choice of an attribute, for example "Red". */
export interface AttributeValueOption {
  id: string;
  label: string;
  colorHex: string | null;
}

/** An attribute with its choices, for example "Color". */
export interface AttributeOption {
  id: string;
  label: string;
  values: AttributeValueOption[];
}

/** An image of the library: the display size and the name shown next to it. */
export interface MediaOption {
  id: string;
  src: string;
  name: string;
}
