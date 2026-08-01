// 无类型声明的第三方依赖环境声明
declare module 'sql.js' {
  export interface SqlJsDatabase {
    run(sql: string, params?: any[]): void;
    exec(sql: string, params?: any[]): any[];
    prepare(sql: string): SqlJsStatement;
    export(): Uint8Array;
    close(): void;
  }
  export interface SqlJsStatement {
    bind(params: any[]): void;
    step(): boolean;
    getAsObject(): any;
    free(): void;
  }
  export interface SqlJsStatic {
    Database(data?: Uint8Array): SqlJsDatabase;
  }
  export default function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<SqlJsStatic>;
}

declare module 'ws' {
  export default class WebSocket {
    constructor(url: string, protocols?: string | string[]);
    on(event: string, listener: (...args: any[]) => void): this;
    send(data: any): void;
    close(): void;
    readyState: number;
    static OPEN: number;
    static CLOSED: number;
  }
}
