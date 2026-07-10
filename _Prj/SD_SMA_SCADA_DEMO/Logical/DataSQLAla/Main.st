
PROGRAM _INIT
	AlarmDataSQLQuery.Config.PointName[0] := 'AlarmTime';
	AlarmDataSQLQuery.Config.PointName[1] := 'AlarmCode';
	AlarmDataSQLQuery.Config.PointName[2] := 'AlarmState';
	AlarmDataSQLQuery.Config.PointName[3] := 'AlarmText';
	bSimEnable := TRUE;
END_PROGRAM

PROGRAM _CYCLIC
	UtcDTGetTime_0.enable := TRUE;
	UtcDTGetTime_0();
	IF UtcDTGetTime_0.status = 0 THEN
		dtNow := UtcDTGetTime_0.DT1;
	END_IF

	(*随机报警插入：采集端 reset_trigger_after_read 清零后再次产生*)
	tonAlarm(IN := bSimEnable AND NOT AlarmInsertBuffer.InsertTrigger, PT := T#8s);
	IF EDGEPOS(tonAlarm.Q) THEN
		AlarmInsertBuffer.AlarmTime := dtNow;
		diAlarmCode := RandRange(1000, 1099);
		AlarmInsertBuffer.AlarmCode := DINT_TO_UDINT(diAlarmCode);
		AlarmInsertBuffer.AlarmState := DINT_TO_UDINT(RandRange(0, 1));
		strTmp := '';
		brsitoa(diAlarmCode, ADR(strTmp));
		AlarmInsertBuffer.AlarmText := 'SIM_ALARM_';
		brsstrcat(ADR(AlarmInsertBuffer.AlarmText), ADR(strTmp));
		AlarmInsertBuffer.AlarmBatch := gDataSQLBatch.BatchCode;
		AlarmInsertBuffer.InsertTrigger := TRUE;
	END_IF
END_PROGRAM

PROGRAM _EXIT

END_PROGRAM
