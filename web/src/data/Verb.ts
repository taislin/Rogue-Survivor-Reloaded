export class Verb {
  readonly youForm: string;
  readonly heForm: string;

  constructor(youForm: string, heForm?: string) {
    this.youForm = youForm;
    this.heForm = heForm ?? `${youForm}s`;
  }
}
