// 无类型声明的第三方依赖环境声明
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
