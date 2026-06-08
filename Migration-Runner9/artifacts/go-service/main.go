package main

import (
        "encoding/json"
        "log"
        "net/http"
        "os"
        "strings"
        "sync"
        "time"

        "github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
        CheckOrigin: func(r *http.Request) bool {
                // In production restrict WS to the configured origin host. In dev
                // (or when ALLOWED_ORIGIN is unset) allow same-host upgrades only.
                allowed := os.Getenv("ALLOWED_ORIGIN")
                origin := r.Header.Get("Origin")
                if origin == "" {
                        // Native clients (mobile/Flutter) often send no Origin header.
                        return true
                }
                if allowed != "" {
                        return origin == allowed
                }
                // Dev fallback: allow Replit dev domain + localhost.
                if dev := os.Getenv("REPLIT_DEV_DOMAIN"); dev != "" {
                        if origin == "https://"+dev || origin == "http://"+dev {
                                return true
                        }
                }
                return strings.HasPrefix(origin, "http://localhost") ||
                        strings.HasPrefix(origin, "http://127.0.0.1")
        },
}

// Server is the long-lived process state shared by HTTP handlers + WS hub.
type Server struct {
        engine *Engine

        wsMu  sync.RWMutex
        wsSub map[*wsClient]struct{}
}

type wsClient struct {
        conn     *websocket.Conn
        sendMu   sync.Mutex
        channels map[string]struct{}
        chMu     sync.Mutex
}

func (c *wsClient) hasChannel(ch string) bool {
        c.chMu.Lock()
        defer c.chMu.Unlock()
        _, ok := c.channels[ch]
        return ok
}

func (c *wsClient) addChannel(ch string) {
        c.chMu.Lock()
        defer c.chMu.Unlock()
        c.channels[ch] = struct{}{}
}

func newServer() *Server {
        return &Server{
                engine: NewEngine(),
                wsSub:  make(map[*wsClient]struct{}),
        }
}

// broadcast pushes a JSON frame to every WS subscriber of `channel`.
func (s *Server) broadcast(channel string, data any) {
        frame, err := json.Marshal(map[string]any{
                "channel": channel,
                "ts":      time.Now().UnixMilli(),
                "data":    data,
        })
        if err != nil {
                return
        }
        s.wsMu.RLock()
        clients := make([]*wsClient, 0, len(s.wsSub))
        for c := range s.wsSub {
                if c.hasChannel(channel) {
                        clients = append(clients, c)
                }
        }
        s.wsMu.RUnlock()
        for _, c := range clients {
                c.sendMu.Lock()
                _ = c.conn.WriteMessage(websocket.TextMessage, frame)
                c.sendMu.Unlock()
        }
}

func (s *Server) registerClient(c *wsClient) {
        s.wsMu.Lock()
        defer s.wsMu.Unlock()
        s.wsSub[c] = struct{}{}
}

func (s *Server) removeClient(c *wsClient) {
        s.wsMu.Lock()
        defer s.wsMu.Unlock()
        delete(s.wsSub, c)
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        _ = json.NewEncoder(w).Encode(map[string]any{
                "status":  "ok",
                "service": "cryptox-go",
                "ts":      time.Now().UnixMilli(),
                "books":   len(s.engine.books),
        })
}

// WebSocket: clients subscribe via {type:"subscribe",channel:"futures.orderbook:1"}
// and we push frames whenever broadcast(channel,...) is called.
func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
        c, err := upgrader.Upgrade(w, r, nil)
        if err != nil {
                log.Println("upgrade:", err)
                return
        }
        cli := &wsClient{conn: c, channels: map[string]struct{}{}}
        s.registerClient(cli)
        defer func() {
                s.removeClient(cli)
                c.Close()
        }()

        for {
                _, msg, err := c.ReadMessage()
                if err != nil {
                        return
                }
                var m map[string]any
                if json.Unmarshal(msg, &m) != nil {
                        continue
                }
                t, _ := m["type"].(string)
                ch, _ := m["channel"].(string)
                if t == "subscribe" && ch != "" {
                        cli.addChannel(ch)
                }
                if t == "ping" {
                        cli.sendMu.Lock()
                        _ = c.WriteMessage(websocket.TextMessage, []byte(`{"type":"pong"}`))
                        cli.sendMu.Unlock()
                }
        }
}

func main() {
        port := os.Getenv("PORT")
        if port == "" {
                port = "8090"
        }
        prefix := os.Getenv("BASE_PATH")
        if prefix == "" {
                prefix = "/go-service/"
        }
        prefix = strings.TrimRight(prefix, "/")

        srv := newServer()
        mux := http.NewServeMux()

        // Public health + WS (also under the artifact prefix for dev preview).
        mux.HandleFunc("/healthz", srv.handleHealth)
        mux.HandleFunc("/ws", srv.handleWS)
        mux.HandleFunc(prefix+"/healthz", srv.handleHealth)
        mux.HandleFunc(prefix+"/ws", srv.handleWS)
        mux.HandleFunc(prefix+"/", srv.handleHealth)

        // Internal RPC for the Node api-server (loopback only in production).
        mux.HandleFunc("/internal/futures/place", srv.handlePlace)
        mux.HandleFunc("/internal/futures/cancel", srv.handleCancel)
        mux.HandleFunc("/internal/futures/seed", srv.handleSeed)
        mux.HandleFunc("/internal/futures/snapshot", srv.handleSnapshot)

        // The Go service is reached only by the Node api-server on the same
        // host. Binding to 127.0.0.1 prevents any external caller from hitting
        // the unauthenticated /internal/futures/* matching RPC, which can
        // mutate book state. A shared-secret middleware is tracked as a
        // follow-up; loopback binding is the network-level guarantee.
        bind := os.Getenv("BIND_ADDR")
        if bind == "" {
                bind = "127.0.0.1"
        }
        addr := bind + ":" + port
        log.Printf("cryptox-go listening on %s (futures matching engine ready)", addr)
        if err := http.ListenAndServe(addr, mux); err != nil {
                log.Fatal(err)
        }
}
