"""Approved session-journal column order; sensitive values are projected separately."""
SESSION_JOURNAL_FIELDS = (
    'Record No.', 'Event Time (UTC)', 'NorenTimeStamp', 'NorenNsecs', 'msg_type',
    'UserId', 'Seqno', 'msg_seq', 'AccessType', 'AddlSrcInfoes', 'LoginProcId',
    'Question2fas', 'ReqStatus', 'UserPrivilege', 'UserSessId',
    'Userdetails.AcctIds', 'Userdetails.BrokerId', 'Userdetails.Login2faDatas',
    'Userdetails.PrevPasswords', 'Userdetails.Products', 'Userdetails.User2faDetails',
    'Userdetails.UserAccessTypes', 'Userdetails.UserDpinDetails',
    'Userdetails.UserExchDetails', 'Userdetails.UserId', 'Userdetails.UserMws',
    'Userdetails.UserOrdTypes',
)
REDACTED_SESSION_FIELDS = frozenset((
    'AddlSrcInfoes', 'LoginProcId', 'Question2fas', 'UserSessId',
    'Userdetails.Login2faDatas', 'Userdetails.PrevPasswords',
    'Userdetails.User2faDetails', 'Userdetails.UserDpinDetails',
))

# Login carries a larger source schema; logout retains the original subset.
import json
from pathlib import Path
LOGOUT_JOURNAL_FIELDS = SESSION_JOURNAL_FIELDS
SESSION_JOURNAL_FIELDS = tuple(json.loads(Path(__file__).with_name("journal_schema.json").read_text())["login"])
REDACTED_SESSION_FIELDS |= {"Userdetails.Dob", "Userdetails.EmailId", "Userdetails.MobNum", "Userdetails.UserName", "Userdetails.UserSessId", "Userdetails.UserSessOtp", "Userdetails.LastLoginMac", "Userdetails.UserMacAddr", "Msg", "Userdetails.UserTag"}
