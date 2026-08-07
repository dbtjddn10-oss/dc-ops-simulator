/**
 * 장애(Incident) 데이터 카탈로그
 *
 * v0.6부터 Terminal 조사 결과와 Easy Mode 조사 힌트를 Incident 데이터와 함께 관리합니다.
 * app.js는 명령을 안전하게 분류하고, 이 파일은 장애별로 달라지는
 * 출력과 유용한 명령 목록을 제공합니다.
 */
(function exposeIncidentData(global) {
  "use strict";

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  const incidents = deepFreeze([
    {
      incidentId: "INC-001",
      title: "Nginx Service Down",
      affectedRack: null,
      severity: "Critical",
      symptom: "웹 서비스 연결 거부 및 HTTP 502 응답",
      rootCause: "Nginx 프로세스가 비정상 종료되었습니다.",
      correctDiagnosis: "Nginx Service Down",
      correctAction: "Nginx 서비스를 재시작하고 상태를 확인합니다.",
      cpu: 82,
      ram: 78,
      disk: 55,
      network: 5,
      temperature: 23.8,
      score: 100,
      slaSeconds: 55,
      investigationHint: "CHECK AREA: SERVICE / HTTP",
      usefulCommands: ["systemctl status nginx", "journalctl -u nginx", "curl"],
      diagnosticCommands: {
        "systemctl status nginx": `● nginx.service - A high performance web server
   Loaded: loaded (/lib/systemd/system/nginx.service; enabled)
   Active: failed (Result: exit-code)
  Process: 2147 ExecStart=/usr/sbin/nginx (code=exited, status=1/FAILURE)`,
        "journalctl -u nginx": `Aug 08 22:14:03 nginx[2147]: bind() to 0.0.0.0:80 failed (98: Address already in use)
Aug 08 22:14:03 systemd[1]: nginx.service: Main process exited, status=1/FAILURE
Aug 08 22:14:03 systemd[1]: nginx.service: Failed with result 'exit-code'.`,
        "curl": "curl: (7) Failed to connect to localhost port 80: Connection refused",
        "ss -lntp": `State   Recv-Q  Send-Q   Local Address:Port   Process
LISTEN  0       128      0.0.0.0:22          users:((\"sshd\",pid=721,fd=3))
# no process is listening on TCP port 80`
      }
    },
    {
      incidentId: "INC-002",
      title: "Disk Usage Critical",
      affectedRack: null,
      severity: "Critical",
      symptom: "Disk 쓰기 실패 및 저장 공간 부족 경고",
      rootCause: "로그 파일 증가로 Disk 사용률이 임계치를 초과했습니다.",
      correctDiagnosis: "Disk Usage Critical",
      correctAction: "불필요한 로그를 정리하고 Disk 공간을 확보합니다.",
      cpu: 66,
      ram: 74,
      disk: 98,
      network: 48,
      temperature: 24.1,
      score: 100,
      slaSeconds: 60,
      investigationHint: "CHECK AREA: STORAGE",
      usefulCommands: ["df -h"],
      diagnosticCommands: {
        "df -h": `Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1        50G   49G  500M  99% /
/dev/sdb1       200G  108G   92G  54% /data`,
        "journalctl -u nginx": `Aug 08 22:18:42 nginx[938]: writev() failed (28: No space left on device)
Aug 08 22:18:43 nginx[938]: could not write access log`
      }
    },
    {
      incidentId: "INC-003",
      title: "High CPU Load",
      affectedRack: null,
      severity: "Critical",
      symptom: "응답 시간 증가 및 처리 요청 적체",
      rootCause: "비정상 프로세스가 CPU 자원을 과도하게 사용하고 있습니다.",
      correctDiagnosis: "High CPU Load",
      correctAction: "원인 프로세스를 확인하고 안전하게 재시작합니다.",
      cpu: 99,
      ram: 91,
      disk: 62,
      network: 84,
      temperature: 27.2,
      score: 100,
      slaSeconds: 45,
      investigationHint: "CHECK AREA: RESOURCE",
      usefulCommands: ["top", "uptime"],
      diagnosticCommands: {
        "top": `top - 22:26:11 up 47 days,  4:18,  1 user,  load average: 9.84, 8.91, 6.42
%Cpu(s): 97.8 us,  1.2 sy,  0.0 ni,  1.0 id
PID   USER   %CPU   %MEM   COMMAND
1842  root   97.8    8.3   node
938   www     0.8    1.2   nginx`,
        "uptime": "22:26:11 up 47 days, 4:18, 1 user, load average: 9.84, 8.91, 6.42"
      }
    },
    {
      incidentId: "INC-004",
      title: "Network Port Blocked",
      affectedRack: null,
      severity: "Critical",
      symptom: "서비스 포트 연결 시간 초과 및 Packet 손실",
      rootCause: "방화벽 정책 변경으로 서비스 Port가 차단되었습니다.",
      correctDiagnosis: "Network Port Blocked",
      correctAction: "방화벽 정책을 확인하고 서비스 Port를 허용합니다.",
      cpu: 45,
      ram: 61,
      disk: 52,
      network: 0,
      temperature: 22.6,
      score: 100,
      slaSeconds: 50,
      investigationHint: "CHECK AREA: NETWORK",
      usefulCommands: ["ping", "curl", "ss -lntp", "traceroute"],
      diagnosticCommands: {
        "ping": `PING 10.20.0.1 (10.20.0.1) 56(84) bytes of data.
64 bytes from 10.20.0.1: icmp_seq=1 ttl=63 time=0.82 ms
--- 10.20.0.1 ping statistics ---
4 packets transmitted, 1 received, 75% packet loss`,
        "curl": "curl: (28) Failed to connect to localhost port 80: Connection timed out",
        "ss -lntp": `State   Recv-Q  Send-Q   Local Address:Port   Process
LISTEN  0       511      0.0.0.0:80          users:((\"nginx\",pid=938,fd=6))
LISTEN  0       128      0.0.0.0:22          users:((\"sshd\",pid=721,fd=3))`,
        "systemctl status nginx": `● nginx.service - A high performance web server
   Loaded: loaded (/lib/systemd/system/nginx.service; enabled)
   Active: active (running) since 22:00:08; 26min ago
 Main PID: 938 (nginx)`,
        "traceroute": `traceroute to 10.20.0.1 (10.20.0.1), 30 hops max
 1  10.20.4.1  0.411 ms  0.390 ms  0.372 ms
 2  * * *
 3  * * *`
      }
    },
    {
      incidentId: "INC-005",
      title: "Cooling System Failure",
      affectedRack: null,
      severity: "Critical",
      symptom: "서버 흡기 온도 급상승 및 냉각 경보",
      rootCause: "해당 구역의 CRAC 냉각 장치가 정지했습니다.",
      correctDiagnosis: "Cooling System Failure",
      correctAction: "비상 냉각을 가동하고 CRAC 장치를 복구합니다.",
      cpu: 75,
      ram: 79,
      disk: 68,
      network: 57,
      temperature: 38.5,
      score: 100,
      slaSeconds: 40,
      investigationHint: "CHECK AREA: FACILITY / TEMPERATURE",
      usefulCommands: ["top"],
      sensorAlert: `TEMP SENSOR WARNING
INLET TEMP: 38.5°C
Linux process data alone cannot confirm a facility cooling failure.`,
      diagnosticCommands: {
        "top": `top - 22:31:44 up 47 days,  4:23,  1 user,  load average: 1.42, 1.28, 1.16
%Cpu(s): 18.4 us,  5.2 sy,  0.0 ni, 76.4 id
PID   USER   %CPU   %MEM   COMMAND
938   www    12.7    1.2   nginx
1102  root    3.1    0.8   node_exporter
# no runaway process detected; check facility sensor telemetry`
      }
    }
  ]);

  global.DCOpsData = Object.freeze({ incidents });
})(window);
