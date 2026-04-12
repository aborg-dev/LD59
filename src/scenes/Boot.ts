import { Scene } from "phaser";

export interface BootState {
  active: boolean;
}

export class Boot extends Scene {
  constructor() {
    super("Boot");
  }

  create() {
    this.scene.launch("DebugScene");
    this.scene.start("Preloader");
  }

  dumpState(): BootState {
    return { active: this.scene.isActive() };
  }
}
