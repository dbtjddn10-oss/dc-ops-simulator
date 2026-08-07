/**
 * v0.7 Incident 데이터 카탈로그
 *
 * app.js는 공통 게임/Terminal 엔진을 담당하고, 이 파일은 장애별 데이터와
 * Terminal override를 담당합니다. 새 Incident는 이 배열에 객체 하나를
 * 추가하는 방식으로 확장할 수 있습니다.
 */
(function exposeIncidentData(global) {
  "use strict";

  const REQUIRED_FIELDS = Object.freeze([
    "incidentId", "title", "category", "minDifficulty", "severity", "symptom",
    "rootCause", "correctDiagnosis", "correctAction", "cpu", "ram", "disk",
    "network", "temperature", "score", "slaSeconds", "investigationHint",
    "usefulCommands", "diagnosticCommands"
  ]);
  const CATEGORIES = Object.freeze(["SERVER", "STORAGE", "NETWORK", "POWER", "COOLING"]);
  const DIFFICULTY_RANK = Object.freeze({ EASY: 1, NORMAL: 2, HARD: 3 });

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  const incidentCatalog = [
    {
      incidentId: "INC-001",
      title: "Nginx Service Down",
      category: "SERVER",
      minDifficulty: "EASY",
      affectedRack: null,
      severity: "P2",
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
        curl: "curl: (7) Failed to connect to localhost port 80: Connection refused",
        "ss -lntp": `State   Recv-Q  Send-Q   Local Address:Port   Process
LISTEN  0       128      0.0.0.0:22          users:((\"sshd\",pid=721,fd=3))
# no process is listening on TCP port 80`
      }
    },
    {
      incidentId: "INC-002",
      title: "Disk Usage Critical",
      category: "STORAGE",
      minDifficulty: "EASY",
      affectedRack: null,
      severity: "P2",
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
      category: "SERVER",
      minDifficulty: "EASY",
      affectedRack: null,
      severity: "P2",
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
      investigationHint: "CHECK AREA: RESOURCE / CPU",
      usefulCommands: ["top", "uptime"],
      diagnosticCommands: {
        top: `top - 22:26:11 up 47 days, 4:18, 1 user, load average: 9.84, 8.91, 6.42
%Cpu(s): 97.8 us, 1.2 sy, 0.0 ni, 1.0 id
PID   USER   %CPU   %MEM   COMMAND
1842  root   97.8    8.3   node
938   www     0.8    1.2   nginx`,
        uptime: "22:26:11 up 47 days, 4:18, 1 user, load average: 9.84, 8.91, 6.42"
      }
    },
    {
      incidentId: "INC-004",
      title: "Network Port Blocked",
      category: "NETWORK",
      minDifficulty: "EASY",
      affectedRack: null,
      severity: "P2",
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
      investigationHint: "CHECK AREA: NETWORK / PORT",
      usefulCommands: ["ping", "curl", "ss -lntp", "traceroute"],
      diagnosticCommands: {
        ping: `PING 10.20.0.1 (10.20.0.1) 56(84) bytes of data.
64 bytes from 10.20.0.1: icmp_seq=1 ttl=63 time=0.82 ms
--- 10.20.0.1 ping statistics ---
4 packets transmitted, 1 received, 75% packet loss`,
        curl: "curl: (28) Failed to connect to localhost port 80: Connection timed out",
        "ss -lntp": `State   Recv-Q  Send-Q   Local Address:Port   Process
LISTEN  0       511      0.0.0.0:80          users:((\"nginx\",pid=938,fd=6))
LISTEN  0       128      0.0.0.0:22          users:((\"sshd\",pid=721,fd=3))`,
        "systemctl status nginx": `● nginx.service - A high performance web server
   Active: active (running) since 22:00:08; 26min ago`,
        traceroute: `traceroute to 10.20.0.1 (10.20.0.1), 30 hops max
 1  10.20.4.1  0.411 ms  0.390 ms  0.372 ms
 2  * * *
 3  * * *`
      }
    },
    {
      incidentId: "INC-005",
      title: "Cooling System Failure",
      category: "COOLING",
      minDifficulty: "EASY",
      affectedRack: null,
      severity: "P1",
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
      usefulCommands: ["ipmitool sensor", "top"],
      sensorAlert: `TEMP SENSOR WARNING
INLET TEMP: 38.5°C
CRAC ZONE A: OFFLINE
Linux process data alone cannot confirm a facility cooling failure.`,
      diagnosticCommands: {
        "ipmitool sensor": `Inlet Temp       | 38.5 | degrees C | cr
Exhaust Temp     | 47.2 | degrees C | cr
Fan1 RPM         | 7100 | RPM | ok
CRAC Zone A      | 0x00 | discrete | cr`,
        top: `top - 22:31:44 up 47 days, 4:23, 1 user, load average: 1.42, 1.28, 1.16
%Cpu(s): 18.4 us, 5.2 sy, 0.0 ni, 76.4 id
PID   USER   %CPU   %MEM   COMMAND
938   www    12.7    1.2   nginx
# no runaway process detected; check facility sensor telemetry`
      }
    },
    {
      incidentId: "INC-006",
      title: "Memory Pressure / OOM",
      category: "SERVER",
      minDifficulty: "EASY",
      affectedRack: null,
      severity: "P2",
      symptom: "응답 지연, 애플리케이션 강제 종료 및 Memory 부족 경고",
      rootCause: "메모리 사용량 급증으로 Linux OOM Killer가 애플리케이션 프로세스를 종료했습니다.",
      correctDiagnosis: "Memory Pressure / OOM",
      correctAction: "메모리 사용 프로세스를 확인하고 원인 프로세스 또는 서비스를 안전하게 재시작합니다.",
      cpu: 78,
      ram: 99,
      disk: 61,
      network: 55,
      temperature: 28.5,
      score: 105,
      slaSeconds: 50,
      investigationHint: "CHECK AREA: MEMORY / PROCESS",
      usefulCommands: ["free -m", "top", "dmesg"],
      diagnosticCommands: {
        "free -m": `              total        used        free      shared  buff/cache   available
Mem:           8192        7894          64         110         234          86
Swap:          2048        1987          61`,
        top: `top - 22:35:10 up 47 days, 4:27, 1 user, load average: 3.20, 2.74, 2.18
%Cpu(s): 71.2 us, 5.8 sy, 0.0 ni, 23.0 id
PID   USER   %CPU   %MEM   COMMAND
2419  app     68.4   76.3   java
938   www      2.8    1.2   nginx`,
        dmesg: `[48216.448211] Memory cgroup out of memory: Killed process 2419 (java)
[48216.448290] oom-kill: constraint=CONSTRAINT_MEMCG, task=java, pid=2419
[48216.448411] Out of memory: Killed process 2419 total-vm:7824512kB, anon-rss:6248532kB`
      }
    },
    {
      incidentId: "INC-007",
      title: "Disk I/O Latency",
      category: "STORAGE",
      minDifficulty: "NORMAL",
      affectedRack: null,
      severity: "P2",
      symptom: "CPU는 정상 범위지만 파일 읽기/쓰기와 애플리케이션 응답이 크게 지연됨",
      rootCause: "Disk I/O wait 증가와 Storage device latency로 요청 처리가 지연되고 있습니다.",
      correctDiagnosis: "Disk I/O Latency",
      correctAction: "I/O를 과도하게 발생시키는 프로세스를 확인하고 Storage 상태와 device error를 점검합니다.",
      cpu: 48,
      ram: 63,
      disk: 76,
      network: 42,
      temperature: 24.5,
      score: 110,
      slaSeconds: 55,
      investigationHint: "CHECK AREA: STORAGE / I/O",
      usefulCommands: ["iostat", "dmesg", "df -h"],
      diagnosticCommands: {
        iostat: `Linux 6.8.0-dcops

avg-cpu:  %user  %system  %iowait  %idle
           7.10     2.40     41.80  48.70

Device   r/s    w/s   await  aqu-sz  %util
sda     42.8  183.4   82.60    9.42  98.60`,
        dmesg: `[49182.110421] blk_update_request: I/O error, dev sda, sector 184320
[49182.110477] sd 0:0:0:0: timing out command, waited 30s`,
        "df -h": `Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1        50G   34G   16G  68% /
/dev/sdb1       200G  112G   88G  56% /data`
      }
    },
    {
      incidentId: "INC-008",
      title: "Filesystem Read-Only",
      category: "STORAGE",
      minDifficulty: "HARD",
      affectedRack: null,
      severity: "P2",
      symptom: "파일과 로그 저장이 실패하며 Read-only file system 메시지가 발생함",
      rootCause: "Filesystem 오류를 감지한 OS가 데이터 보호를 위해 루트 파일시스템을 read-only로 remount했습니다.",
      correctDiagnosis: "Filesystem Read-Only",
      correctAction: "파일시스템 오류를 확인하고 안전한 maintenance 절차로 점검 및 복구합니다.",
      cpu: 55,
      ram: 68,
      disk: 87,
      network: 46,
      temperature: 25.0,
      score: 115,
      slaSeconds: 45,
      investigationHint: "CHECK AREA: FILESYSTEM",
      usefulCommands: ["mount", "dmesg", "df -h"],
      diagnosticCommands: {
        mount: `/dev/sda1 on / type ext4 (ro,relatime,errors=remount-ro)
/dev/sdb1 on /data type ext4 (rw,relatime)`,
        dmesg: `[50211.778412] EXT4-fs error (device sda1): ext4_find_entry:1455: inode #524301: comm nginx: reading directory lblock 0
[50211.778499] Aborting journal on device sda1-8.
[50211.778540] EXT4-fs (sda1): Remounting filesystem read-only`,
        "df -h": `Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1        50G   37G   13G  74% /
/dev/sdb1       200G  109G   91G  55% /data`
      }
    },
    {
      incidentId: "INC-009",
      title: "DNS Resolution Failure",
      category: "NETWORK",
      minDifficulty: "EASY",
      affectedRack: null,
      severity: "P2",
      symptom: "IP 직접 접속은 가능하지만 hostname 기반 서비스 접근과 name resolution이 실패함",
      rootCause: "잘못된 DNS resolver 설정으로 요청이 응답하지 않는 nameserver로 전달되고 있습니다.",
      correctDiagnosis: "DNS Resolution Failure",
      correctAction: "DNS 설정과 resolver 연결 상태를 확인하고 정상 nameserver로 복구합니다.",
      cpu: 38,
      ram: 57,
      disk: 41,
      network: 35,
      temperature: 22.8,
      score: 100,
      slaSeconds: 55,
      investigationHint: "CHECK AREA: DNS / RESOLVER",
      usefulCommands: ["nslookup", "cat /etc/resolv.conf", "ping"],
      diagnosticCommands: {
        nslookup: `;; communications error to 10.20.99.53#53: timed out
;; no servers could be reached`,
        "cat /etc/resolv.conf": `search dc-ops.local
nameserver 10.20.99.53
options timeout:1 attempts:2`,
        ping: `PING 10.20.10.25 (10.20.10.25) 56(84) bytes of data.
64 bytes from 10.20.10.25: icmp_seq=1 ttl=63 time=0.74 ms
64 bytes from 10.20.10.25: icmp_seq=2 ttl=63 time=0.71 ms
--- 10.20.10.25 ping statistics ---
2 packets transmitted, 2 received, 0% packet loss`
      }
    },
    {
      incidentId: "INC-010",
      title: "Network Interface Packet Errors",
      category: "NETWORK",
      minDifficulty: "NORMAL",
      affectedRack: null,
      severity: "P2",
      symptom: "Packet loss, 간헐적 연결 끊김 및 서비스 latency 증가",
      rootCause: "NIC 또는 물리 link 품질 문제로 RX/TX error와 dropped packet이 증가했습니다.",
      correctDiagnosis: "Network Interface Packet Errors",
      correctAction: "NIC 상태와 link error를 확인하고 interface 또는 물리 연결을 복구합니다.",
      cpu: 53,
      ram: 66,
      disk: 49,
      network: 8,
      temperature: 23.9,
      score: 110,
      slaSeconds: 50,
      investigationHint: "CHECK AREA: NETWORK / INTERFACE",
      usefulCommands: ["ping", "ethtool eth0", "ip addr"],
      diagnosticCommands: {
        ping: `PING 10.20.0.1 (10.20.0.1) 56(84) bytes of data.
64 bytes from 10.20.0.1: icmp_seq=1 ttl=63 time=18.2 ms
--- 10.20.0.1 ping statistics ---
10 packets transmitted, 6 received, 40% packet loss`,
        "ethtool eth0": `Settings for eth0:
\tSpeed: 1000Mb/s
\tDuplex: Full
\tLink detected: yes
NIC statistics:
\trx_errors: 1842
\ttx_errors: 317
\trx_dropped: 926
\trx_crc_errors: 1401`,
        "ip addr": `2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP
    inet 10.20.10.15/24 scope global eth0
    RX: errors 1842 dropped 926 overruns 0 frame 1401`
      }
    },
    {
      incidentId: "INC-011",
      title: "PSU Redundancy Lost",
      category: "POWER",
      minDifficulty: "NORMAL",
      affectedRack: null,
      severity: "P3",
      symptom: "서버는 정상 동작하지만 PSU redundancy 경고와 단일 PSU feed 장애가 감지됨",
      rootCause: "이중화된 PSU 중 PSU2가 정상 전원을 공급하지 못해 redundancy가 저하되었습니다.",
      correctDiagnosis: "PSU Redundancy Lost",
      correctAction: "실패한 PSU와 전원 입력을 확인하고 이중화 상태를 복구합니다.",
      cpu: 34,
      ram: 48,
      disk: 44,
      network: 51,
      temperature: 23.1,
      score: 80,
      slaSeconds: 75,
      investigationHint: "CHECK AREA: POWER / PSU",
      usefulCommands: ["ipmitool sensor", "uptime"],
      sensorAlert: `POWER SENSOR ALERT
PSU2 INPUT: LOST
PSU1 INPUT: ACTIVE
REDUNDANCY: DEGRADED`,
      diagnosticCommands: {
        "ipmitool sensor": `PSU1 Status      | 0x01 | ok
PSU1 Input       | 228  | Volts | ok
PSU2 Status      | 0x00 | cr
PSU2 Input       | 0    | Volts | cr
Power Redundancy | Lost | discrete | cr`,
        uptime: "22:42:12 up 47 days, 4:34, 1 user, load average: 0.38, 0.42, 0.31"
      }
    },
    {
      incidentId: "INC-012",
      title: "Rack PDU Feed A Lost",
      category: "POWER",
      minDifficulty: "HARD",
      affectedRack: null,
      severity: "P1",
      symptom: "Rack 전원 redundancy와 일부 power sensor 경고가 발생했지만 시스템은 Feed B로 운영 중",
      rootCause: "Rack PDU A 전원 Feed가 상실되어 전체 Rack이 PDU B 단일 경로로 운영되고 있습니다.",
      correctDiagnosis: "Rack PDU Feed A Lost",
      correctAction: "Rack PDU A 전원 공급 경로를 확인하고 redundant feed를 복구합니다.",
      cpu: 45,
      ram: 64,
      disk: 52,
      network: 56,
      temperature: 25.4,
      score: 125,
      slaSeconds: 38,
      investigationHint: "CHECK AREA: POWER / PDU",
      usefulCommands: ["ipmitool sensor", "uptime"],
      sensorAlert: `FACILITY POWER ALERT
PDU-A FEED: LOST
PDU-B FEED: ACTIVE
RACK POWER: REDUNDANCY DEGRADED`,
      diagnosticCommands: {
        "ipmitool sensor": `PDU-A Feed       | 0x00 | cr
PDU-A Voltage    | 0    | Volts | cr
PDU-B Feed       | 0x01 | ok
PDU-B Voltage    | 229  | Volts | ok
Rack Redundancy  | Lost | discrete | cr`,
        uptime: "22:44:28 up 47 days, 4:36, 1 user, load average: 0.51, 0.48, 0.39"
      }
    },
    {
      incidentId: "INC-013",
      title: "Input Voltage Instability",
      category: "POWER",
      minDifficulty: "HARD",
      affectedRack: null,
      severity: "P2",
      symptom: "전원 sensor와 hardware health 경고가 발생하며 입력 voltage가 순간적으로 변동함",
      rootCause: "Rack 입력 전압이 정상 범위를 반복적으로 벗어나 전원 공급이 불안정합니다.",
      correctDiagnosis: "Input Voltage Instability",
      correctAction: "전원 입력과 PDU 상태를 확인하고 전압 공급을 정상 범위로 복구합니다.",
      cpu: 58,
      ram: 69,
      disk: 57,
      network: 62,
      temperature: 27.0,
      score: 115,
      slaSeconds: 45,
      investigationHint: "CHECK AREA: POWER / INPUT",
      usefulCommands: ["ipmitool sensor", "uptime"],
      sensorAlert: `POWER QUALITY ALERT
INPUT VOLTAGE: 184V ↔ 247V
EXPECTED RANGE: 210V–240V
STATUS: UNSTABLE`,
      diagnosticCommands: {
        "ipmitool sensor": `Input Voltage    | 184  | Volts | lcr
Input VoltageMax | 247  | Volts | ucr
PSU1 Status      | 0x01 | nc
PSU2 Status      | 0x01 | nc
Power Quality    | Unstable | discrete | cr`,
        uptime: "22:46:40 up 47 days, 4:38, 1 user, load average: 0.72, 0.59, 0.47"
      }
    },
    {
      incidentId: "INC-014",
      title: "Rack Fan Failure",
      category: "COOLING",
      minDifficulty: "NORMAL",
      affectedRack: null,
      severity: "P2",
      symptom: "Fan RPM 경고, 서버 온도 상승 및 BMC hardware warning",
      rootCause: "Rack Server의 Fan3가 정지해 냉각 용량이 감소했습니다.",
      correctDiagnosis: "Rack Fan Failure",
      correctAction: "실패한 Fan을 식별하고 hardware maintenance 절차로 교체 또는 복구합니다.",
      cpu: 61,
      ram: 70,
      disk: 58,
      network: 54,
      temperature: 34.7,
      score: 110,
      slaSeconds: 48,
      investigationHint: "CHECK AREA: COOLING / FAN",
      usefulCommands: ["ipmitool sensor", "top"],
      sensorAlert: `THERMAL SENSOR ALERT
FAN3 RPM: 0
INLET TEMP: 34.7°C
COOLING REDUNDANCY: DEGRADED`,
      diagnosticCommands: {
        "ipmitool sensor": `Fan1 RPM         | 7200 | RPM | ok
Fan2 RPM         | 7100 | RPM | ok
Fan3 RPM         | 0    | RPM | cr
Inlet Temp       | 34.7 | degrees C | nc`,
        top: `top - 22:49:18 up 47 days, 4:41, 1 user, load average: 0.81, 0.66, 0.52
%Cpu(s): 22.1 us, 3.4 sy, 0.0 ni, 74.5 id
# CPU load is not the primary heat source; inspect BMC fan sensors`
      }
    },
    {
      incidentId: "INC-015",
      title: "Hot Aisle Temperature Spike",
      category: "COOLING",
      minDifficulty: "NORMAL",
      affectedRack: null,
      severity: "P2",
      symptom: "Rack inlet/exhaust 온도가 상승했지만 서버 CPU load는 정상 범위임",
      rootCause: "Hot aisle airflow obstruction과 냉각 공기 분배 문제로 Rack 주변 환경 온도가 상승했습니다.",
      correctDiagnosis: "Hot Aisle Temperature Spike",
      correctAction: "Airflow obstruction과 cooling distribution을 확인하고 환경 상태를 정상화합니다.",
      cpu: 42,
      ram: 58,
      disk: 47,
      network: 52,
      temperature: 36.2,
      score: 110,
      slaSeconds: 45,
      investigationHint: "CHECK AREA: COOLING / AIRFLOW",
      usefulCommands: ["ipmitool sensor", "top"],
      sensorAlert: `ENVIRONMENT SENSOR ALERT
INLET TEMP: 33.8°C
EXHAUST TEMP: 44.6°C
HOT AISLE AIRFLOW: RESTRICTED`,
      diagnosticCommands: {
        "ipmitool sensor": `Inlet Temp       | 33.8 | degrees C | nc
Exhaust Temp     | 44.6 | degrees C | cr
Fan1 RPM         | 7200 | RPM | ok
Fan2 RPM         | 7150 | RPM | ok
Airflow Delta    | Low  | discrete | cr`,
        top: `top - 22:52:04 up 47 days, 4:44, 1 user, load average: 0.64, 0.58, 0.49
%Cpu(s): 16.2 us, 2.8 sy, 0.0 ni, 81.0 id
# compute load is normal; correlate with environmental sensor telemetry`
      }
    }
  ];

  function validateIncidentCatalog(items) {
    const errors = [];
    const ids = new Set();
    const categoryCounts = Object.fromEntries(CATEGORIES.map((category) => [category, 0]));

    items.forEach((incident, index) => {
      const label = incident?.incidentId || `index ${index}`;
      REQUIRED_FIELDS.forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(incident ?? {}, field)) {
          errors.push(`${label}: missing ${field}`);
        }
      });
      if (ids.has(incident.incidentId)) errors.push(`${label}: duplicate incidentId`);
      ids.add(incident.incidentId);
      if (!CATEGORIES.includes(incident.category)) errors.push(`${label}: invalid category`);
      else categoryCounts[incident.category] += 1;
      if (!Object.hasOwn(DIFFICULTY_RANK, incident.minDifficulty)) {
        errors.push(`${label}: invalid minDifficulty`);
      }
      if (!Array.isArray(incident.usefulCommands) || new Set(incident.usefulCommands).size === 0) {
        errors.push(`${label}: Hard Mode requires at least one unique useful command`);
      }
      if (!incident.diagnosticCommands || typeof incident.diagnosticCommands !== "object" || Array.isArray(incident.diagnosticCommands)) {
        errors.push(`${label}: diagnosticCommands must be an object`);
      }
    });

    const poolCounts = Object.fromEntries(Object.entries(DIFFICULTY_RANK).map(([difficulty, rank]) => [
      difficulty,
      items.filter((incident) => DIFFICULTY_RANK[incident.minDifficulty] <= rank).length
    ]));

    return deepFreeze({
      valid: errors.length === 0,
      errors,
      total: items.length,
      categoryCounts,
      poolCounts
    });
  }

  const validation = validateIncidentCatalog(incidentCatalog);
  if (!validation.valid) {
    console.error("DC OPS Incident catalog validation failed", validation.errors);
  }

  const incidents = deepFreeze(incidentCatalog);
  global.DCOpsData = Object.freeze({ incidents, validation });
})(window);
