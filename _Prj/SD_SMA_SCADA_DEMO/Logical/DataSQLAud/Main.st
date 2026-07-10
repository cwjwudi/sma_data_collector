
PROGRAM _INIT
	AuditDataSQLQuery.Config.PointName[0] := 'AuditTime';
	AuditDataSQLQuery.Config.PointName[1] := 'AuditOperator';
	AuditDataSQLQuery.Config.PointName[2] := 'AuditText';
	bSimEnable := TRUE;
END_PROGRAM

PROGRAM _CYCLIC
	UtcDTGetTime_0.enable := TRUE;
	UtcDTGetTime_0();
	IF UtcDTGetTime_0.status = 0 THEN
		dtNow := UtcDTGetTime_0.DT1;
	END_IF

	(*随机审计插入：采集端 reset_trigger_after_read 清零后再次产生*)
	tonAudit(IN := bSimEnable AND NOT AuditInsertBuffer.InsertTrigger, PT := T#10s);
	IF EDGEPOS(tonAudit.Q) THEN
		AuditInsertBuffer.AuditTime := dtNow;
		diAuditIdx := RandRange(1, 9);
		strTmp := '';
		brsitoa(diAuditIdx, ADR(strTmp));
		AuditInsertBuffer.AuditOperator := 'Operator';
		brsstrcat(ADR(AuditInsertBuffer.AuditOperator), ADR(strTmp));
		AuditInsertBuffer.AuditText := 'SIM_AUDIT_EVENT_';
		brsstrcat(ADR(AuditInsertBuffer.AuditText), ADR(strTmp));
		AuditInsertBuffer.AuditBatch := gDataSQLBatch.BatchCode;
		AuditInsertBuffer.InsertTrigger := TRUE;
	END_IF
END_PROGRAM

PROGRAM _EXIT

END_PROGRAM
