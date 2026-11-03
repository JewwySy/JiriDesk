// A scheduled task is the only way to start something elevated without a UAC prompt each time.
const xmlText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const argText = (a) => (/\s/.test(a) ? `"${a}"` : a);

// Its defaults would stop the helper after 3 days, skip it on battery and run it at low priority.
function adminTaskXml({ exe, args, user }) {
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Lets JiriDesk send mouse and keyboard input to admin windows during a remote session.</Description></RegistrationInfo>
  <Triggers />
  <Principals>
    <Principal id="Author">
      <UserId>${xmlText(user)}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>4</Priority>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${xmlText(exe)}</Command>
      <Arguments>${xmlText(args.map(argText).join(' '))}</Arguments>
    </Exec>
  </Actions>
</Task>
`;
}

module.exports = { adminTaskXml };
