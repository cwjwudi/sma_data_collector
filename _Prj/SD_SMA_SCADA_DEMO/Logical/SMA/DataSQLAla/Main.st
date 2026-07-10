
PROGRAM _INIT
	AlarmDataSQLQuery.Config.PointName[0] := 'AlarmTime';
	AlarmDataSQLQuery.Config.PointName[1] := 'AlarmCode';
	AlarmDataSQLQuery.Config.PointName[2] := 'AlarmState';
	AlarmDataSQLQuery.Config.PointName[3] := 'AlarmText';
	bSimEnable := TRUE;
END_PROGRAM

PROGRAM _CYCLIC
	(*Fill AlarmInsertBuffer arrays (AlarmInsertBuffer_typ), then set InsertTrigger[i]*)
	UtcDTGetTime_0.enable := TRUE;
	UtcDTGetTime_0();
	IF UtcDTGetTime_0.status = 0 THEN
		dtNow := UtcDTGetTime_0.DT1;
	END_IF

	(*Fire parallel slots 0 / 10 / 49 when those triggers are idle*)
	tonAlarm(IN := bSimEnable AND
		NOT AlarmInsertBuffer.InsertTrigger[0] AND
		NOT AlarmInsertBuffer.InsertTrigger[10] AND
		NOT AlarmInsertBuffer.InsertTrigger[49],
		PT := T#8s);

	IF EDGEPOS(tonAlarm.Q) THEN
		(*Index 0*)
		usiIdx := 0;
		diAlarmCode := RandRange(1000, 1099);
		AlarmInsertBuffer.AlarmTime[usiIdx] := dtNow;
		AlarmInsertBuffer.AlarmCode[usiIdx] := DINT_TO_UDINT(diAlarmCode);
		AlarmInsertBuffer.AlarmState[usiIdx] := DINT_TO_UDINT(RandRange(0, 1));
		strTmp := '';
		brsitoa(diAlarmCode, ADR(strTmp));
		AlarmInsertBuffer.AlarmText[usiIdx] := 'SIM_ALARM_';
		brsstrcat(ADR(AlarmInsertBuffer.AlarmText[usiIdx]), ADR(strTmp));
		AlarmInsertBuffer.AlarmBatch[usiIdx] := gDataSQLBatch.BatchCode;
		AlarmInsertBuffer.InsertTrigger[usiIdx] := TRUE;

		(*Index 10*)
		usiIdx := 10;
		diAlarmCode := RandRange(1000, 1099);
		AlarmInsertBuffer.AlarmTime[usiIdx] := dtNow;
		AlarmInsertBuffer.AlarmCode[usiIdx] := DINT_TO_UDINT(diAlarmCode);
		AlarmInsertBuffer.AlarmState[usiIdx] := DINT_TO_UDINT(RandRange(0, 1));
		strTmp := '';
		brsitoa(diAlarmCode, ADR(strTmp));
		AlarmInsertBuffer.AlarmText[usiIdx] := 'SIM_ALARM_';
		brsstrcat(ADR(AlarmInsertBuffer.AlarmText[usiIdx]), ADR(strTmp));
		AlarmInsertBuffer.AlarmBatch[usiIdx] := gDataSQLBatch.BatchCode;
		AlarmInsertBuffer.InsertTrigger[usiIdx] := TRUE;

		(*Index 49*)
		usiIdx := 49;
		diAlarmCode := RandRange(1000, 1099);
		AlarmInsertBuffer.AlarmTime[usiIdx] := dtNow;
		AlarmInsertBuffer.AlarmCode[usiIdx] := DINT_TO_UDINT(diAlarmCode);
		AlarmInsertBuffer.AlarmState[usiIdx] := DINT_TO_UDINT(RandRange(0, 1));
		strTmp := '';
		brsitoa(diAlarmCode, ADR(strTmp));
		AlarmInsertBuffer.AlarmText[usiIdx] := 'SIM_ALARM_';
		brsstrcat(ADR(AlarmInsertBuffer.AlarmText[usiIdx]), ADR(strTmp));
		AlarmInsertBuffer.AlarmBatch[usiIdx] := gDataSQLBatch.BatchCode;
		AlarmInsertBuffer.InsertTrigger[usiIdx] := TRUE;
	END_IF
END_PROGRAM

PROGRAM _EXIT

END_PROGRAM
