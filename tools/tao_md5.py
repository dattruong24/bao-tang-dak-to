"""Tinh ma md5 cua mat khau de dan vao tools\\tai-khoan.json.

Chay: bam dup tao-mat-khau.bat (hoac: python tools\\tao_md5.py). Mat khau go vao khong hien len man hinh
va khong luu lai o dau ca; chi ma md5 duoc in ra.
"""
import getpass
import hashlib
import sys

sys.stdout.reconfigure(encoding="utf-8")
while True:
    pw = getpass.getpass("Mật khẩu (gõ xong bấm Enter, chữ không hiện ra): ")
    if len(pw) < 8:
        print("Mật khẩu nên dài ít nhất 8 ký tự (md5 của mật khẩu ngắn dò ra rất nhanh). Gõ lại.\n")
        continue
    if getpass.getpass("Gõ lại mật khẩu: ") != pw:
        print("Hai lần gõ không giống nhau. Gõ lại.\n")
        continue
    break
print("\nMã md5 (chép dòng dưới vào ô \"md5\" trong tools\\tai-khoan.json):\n")
print(hashlib.md5(pw.encode("utf-8")).hexdigest())
